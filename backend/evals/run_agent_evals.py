"""Run the agent eval set and report pass/fail per case, plus cost.

Usage (from backend/):
    python -m evals.run_agent_evals                 # live model, needs ANTHROPIC_API_KEY
    python -m evals.run_agent_evals --offline       # harness smoke test, no API calls
    python -m evals.run_agent_evals --case run-after-confirmation --repeat 3

Every case is a scripted conversation run through the real agent loop and tools.
Checks on every assistant reply:
  - no "you should" (educational framing)
  - no em dashes
  - every dollar amount appears in a tool result or the user's own words
  - analyze_roth_conversions only runs after a scenario summary was shown
Plus the case's own expectations (tools called or not, cards shown, final draft
values, reply content). Results are written to evals/results/.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from app.agent.limits import estimate_cost
from app.agent.loop import run_turn
from app.agent.model import ModelClient
from app.tools.draft import ScenarioDraft

HERE = Path(__file__).resolve().parent
CASES_FILE = HERE / "agent_cases.json"
RESULTS_DIR = HERE / "results"

_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|million|thousand|billion)?\b", re.I)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def money_amounts(text: str) -> list[float]:
    out = []
    for value, unit in _MONEY.findall(text):
        amount = float(value.replace(",", ""))
        unit = (unit or "").lower()
        if unit in ("k", "thousand"):
            amount *= 1_000
        elif unit in ("m", "million"):
            amount *= 1_000_000
        elif unit == "billion":
            amount *= 1_000_000_000
        out.append(amount)
    return out


def source_numbers(text: str) -> list[float]:
    numbers = [float(n.replace(",", "")) for n in _NUMBER.findall(text)]
    return numbers + money_amounts(text)


def grounded(amount: float, sources: list[float]) -> bool:
    """True when the amount matches a source number, allowing for rounding."""
    for s in sources:
        if s == 0:
            continue
        if abs(amount - s) <= max(1.0, 0.015 * abs(s)):
            return True
    return False


@dataclass
class TurnRecord:
    user: str
    text: str = ""
    tools: list[str] = field(default_factory=list)
    parts: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    tool_results: list[str] = field(default_factory=list)


@dataclass
class CaseResult:
    id: str
    category: str
    passed: bool
    failures: list[str]
    cost_usd: float
    seconds: float
    transcript: list[dict]


async def run_case(case: dict, client: ModelClient) -> CaseResult:
    history: list[dict] = []
    draft = ScenarioDraft()
    cost = 0.0
    turns: list[TurnRecord] = []
    started = time.monotonic()

    def on_usage(model: str, usage: dict) -> None:
        nonlocal cost
        cost += estimate_cost(model, usage)

    for user_text in case["turns"]:
        record = TurnRecord(user=user_text)
        async for event in run_turn(
            client=client,
            history=history,
            text=user_text,
            draft=draft,
            on_usage=on_usage,
        ):
            kind = event["type"]
            if kind == "text_delta":
                record.text += event["text"]
            elif kind == "tool_start":
                record.tools.append(event["name"])
            elif kind == "part":
                record.parts.append(event["part"]["kind"])
            elif kind == "draft":
                draft = ScenarioDraft.model_validate(event["draft"])
            elif kind == "error":
                record.errors.append(event["code"])
            elif kind == "done":
                for message in event["messages"]:
                    if message["role"] == "user" and isinstance(message["content"], list):
                        record.tool_results += [
                            b["content"]
                            for b in message["content"]
                            if b.get("type") == "tool_result" and isinstance(b.get("content"), str)
                        ]
                history.extend(event["messages"])
        turns.append(record)

    failures = check(case, turns, draft)
    return CaseResult(
        id=case["id"],
        category=case["category"],
        passed=not failures,
        failures=failures,
        cost_usd=round(cost, 5),
        seconds=round(time.monotonic() - started, 1),
        transcript=[
            {"user": t.user, "assistant": t.text, "tools": t.tools, "parts": t.parts} for t in turns
        ],
    )


def check(case: dict, turns: list[TurnRecord], draft: ScenarioDraft) -> list[str]:
    failures: list[str] = []
    expect = case.get("expect", {})
    sources: list[float] = []
    summary_shown = False

    for i, t in enumerate(turns, start=1):
        sources += source_numbers(t.user)
        for result in t.tool_results:
            sources += source_numbers(result)
        if t.errors:
            failures.append(f"turn {i}: error events {t.errors}")
        lowered = t.text.lower()
        if "you should" in lowered:
            failures.append(f"turn {i}: says 'you should'")
        if "—" in t.text:
            failures.append(f"turn {i}: uses an em dash")
        for amount in money_amounts(t.text):
            if not grounded(amount, sources):
                failures.append(f"turn {i}: ${amount:,.0f} not found in tool results or user input")
        if "analyze_roth_conversions" in t.tools and not summary_shown:
            failures.append(f"turn {i}: ran the optimizer before showing a scenario summary")
        if "scenario_summary" in t.parts:
            summary_shown = True

    all_tools = [name for t in turns for name in t.tools]
    all_parts = [kind for t in turns for kind in t.parts]
    final = turns[-1]

    for name in expect.get("tools_called", []):
        if name not in all_tools:
            failures.append(f"expected tool {name}")
    for name in expect.get("tools_not_called", []):
        if name in all_tools:
            failures.append(f"unexpected tool {name}")
    for kind in expect.get("parts_shown", []):
        if kind not in all_parts:
            failures.append(f"expected card {kind}")
    if expect.get("ends_with_suggestions") and "suggestions" not in final.parts:
        failures.append("expected follow-up suggestions on the last reply")
    words = expect.get("reply_mentions_any")
    if words and not any(w.lower() in final.text.lower() for w in words):
        failures.append(f"last reply mentions none of {words}")
    for phrase in expect.get("reply_must_not_contain", []):
        if phrase.lower() in final.text.lower():
            failures.append(f"last reply contains '{phrase}'")
    if expect.get("reply_is_question") and "?" not in final.text:
        failures.append("expected a clarifying question")
    for key, value in expect.get("final_draft", {}).items():
        actual = getattr(draft, key)
        if actual != value and str(actual) != str(value):
            failures.append(f"draft.{key} is {actual!r}, expected {value!r}")
    year = expect.get("final_timeline_note_year")
    if year and not any(row.year == year and row.notes for row in draft.timeline):
        failures.append(f"expected a noted income change in {year}")
    return failures


def make_client(offline: bool) -> ModelClient:
    if offline:
        from app.agent.offline import OfflineModelClient

        return OfflineModelClient()
    from app.agent.model import AnthropicModelClient

    return AnthropicModelClient()


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--offline", action="store_true", help="use the offline stand-in model")
    parser.add_argument("--case", action="append", help="run only these case ids")
    parser.add_argument("--repeat", type=int, default=1, help="runs per case")
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args(argv)

    cases = json.loads(CASES_FILE.read_text())["cases"]
    if args.case:
        cases = [c for c in cases if c["id"] in set(args.case)]
    client = make_client(args.offline)
    semaphore = asyncio.Semaphore(args.concurrency)

    async def guarded(case: dict) -> CaseResult:
        async with semaphore:
            return await run_case(case, client)

    results = await asyncio.gather(*(guarded(c) for c in cases for _ in range(args.repeat)))

    passed = sum(r.passed for r in results)
    total_cost = sum(r.cost_usd for r in results)
    for r in results:
        mark = "PASS" if r.passed else "FAIL"
        print(f"{mark}  {r.id:<34} ${r.cost_usd:.4f}  {r.seconds:>5}s")
        for failure in r.failures:
            print(f"        - {failure}")
    print(
        f"\n{passed}/{len(results)} passed. Total cost ${total_cost:.4f}, "
        f"${total_cost / max(1, len(results)):.4f} per conversation."
    )

    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    report = RESULTS_DIR / f"{stamp}{'-offline' if args.offline else ''}.json"
    report.write_text(json.dumps([r.__dict__ for r in results], indent=2))
    print(f"Report: {report}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
