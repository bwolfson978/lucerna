"""Run the agent eval set and report pass/fail per case, plus cost.

Usage (from backend/):
    python -m evals.run_agent_evals                 # live model, needs ANTHROPIC_API_KEY
    python -m evals.run_agent_evals --offline       # harness smoke test, no API calls
    python -m evals.run_agent_evals --case run-after-confirmation --repeat 3
    python -m evals.run_agent_evals --judged --max-cost 5   # the LLM-judged set, capped

Every case is a scripted conversation run through the real agent loop and tools.
Checks on every assistant reply:
  - it has written text (cards alone don't count)
  - no "you should" as advice (educational framing; declining to say what you should do is fine)
  - no em dashes
  - every dollar amount appears in a tool result, a scenario default or the user's words
    (a bare user number under 1,000 may mean thousands: "about 90" grounds $90,000)
  - analyze_roth_conversions only runs after a scenario summary was shown
Plus the case's own expectations (tools called or not, cards shown, final draft
values, reply content and shape). Results are written to evals/results/.

Cases with a "judge" list are also scored by the LLM judges in evals/judges/ (live runs
only). With Langfuse tracing on (LANGFUSE_TRACING and keys), the run is a Langfuse
experiment on the "agent-evals" dataset (evals/sync_langfuse.py keeps it in step with
this file): one trace per case, with the judges' verdicts as scores on it. Judge
verdicts are reported but don't change the exit code until the judges are calibrated.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from app.agent import tracing
from app.agent.limits import estimate_cost
from app.agent.loop import run_turn
from app.agent.model import ModelClient
from app.agent.observability import TurnTrace
from app.config import settings
from app.tools.draft import ScenarioDraft
from evals.judges import JudgeClient, load_judges

HERE = Path(__file__).resolve().parent
CASES_FILE = HERE / "agent_cases.json"
RESULTS_DIR = HERE / "results"
DATASET = "agent-evals"

_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|million|thousand|billion)?\b", re.I)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
# "you should" as advice. Declining to advise ("I can't tell you what you should convert",
# "I can't say whether you should") is not advice. Only that negated form is excused:
# "Here's what you should do" still counts.
_YOU_SHOULD = re.compile(r"\byou should\b", re.I)
_DECLINING = re.compile(
    r"\b(?:can't|cannot|can not|won't|don't|isn't|not)\b[^.!?\n]{0,40}"
    r"\b(?:what|whether|if)\s+you should\b",
    re.I,
)


_BULLET = re.compile(r"^\s*[-*•]\s+", re.M)
_NUMBERED = re.compile(r"^\s*\d+[.)]\s+(\*\*)?", re.M)


def reply_shape(text: str) -> str:
    """The visual shape a reply renders as: steps, bullets or prose (see <formatting>)."""
    numbered = _NUMBERED.findall(text)
    if len(numbered) >= 2 and all(numbered):
        return "steps"
    if _BULLET.search(text) or numbered:
        return "bullets"
    return "prose"


def gives_advice(text: str) -> bool:
    return bool(_YOU_SHOULD.search(_DECLINING.sub("", text)))


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


def user_numbers(text: str) -> list[float]:
    """Numbers in the user's words. People write thousands without the k ("about 90",
    "500 in the IRA"), so a bare number under 1,000 also counts as that many thousand."""
    numbers = source_numbers(text)
    return numbers + [n * 1_000 for n in numbers if 0 < n < 1_000]


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
    judges: list[dict] = field(default_factory=list)
    skipped: bool = False


async def run_case(case: dict, client: ModelClient) -> CaseResult:
    history: list[dict] = []
    draft = ScenarioDraft()
    cost = 0.0
    turns: list[TurnRecord] = []
    started = time.monotonic()

    def on_usage(model: str, usage: dict) -> None:
        nonlocal cost
        cost += estimate_cost(model, usage)

    session_id = f"eval-{case['id']}-{time.strftime('%Y%m%d-%H%M%S')}"
    for user_text in case["turns"]:
        record = TurnRecord(user=user_text)
        # Without Langfuse tracing the trace only feeds PostHog, which evals leave alone.
        trace = (
            TurnTrace(distinct_id="agent-evals", session_id=session_id)
            if tracing.client()
            else None
        )
        async for event in run_turn(
            client=client,
            history=history,
            text=user_text,
            draft=draft,
            on_usage=on_usage,
            trace=trace,
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
    # The scenario's defaults (7% return, $620 ACA premium...) are fair to state too.
    sources: list[float] = source_numbers(ScenarioDraft().model_dump_json())
    summary_shown = False

    for i, t in enumerate(turns, start=1):
        sources += user_numbers(t.user)
        for result in t.tool_results:
            sources += source_numbers(result)
        if t.errors:
            failures.append(f"turn {i}: error events {t.errors}")
        if not t.text.strip():
            failures.append(f"turn {i}: no written reply")
        if gives_advice(t.text):
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
    shape = expect.get("reply_shape")
    if shape and reply_shape(final.text) != shape:
        failures.append(f"last reply is {reply_shape(final.text)}, expected {shape}")
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


class Budget:
    """Stops starting new cases once the run has spent ``limit`` dollars (None: no cap)."""

    def __init__(self, limit: float | None) -> None:
        self.limit = limit
        self.spent = 0.0

    def exhausted(self) -> bool:
        return self.limit is not None and self.spent >= self.limit


class Evaluator:
    """Runs one case, then the judges listed on it, within the run's budget."""

    def __init__(self, *, offline: bool, budget: Budget) -> None:
        self.offline = offline
        self.budget = budget
        self.judges = load_judges()
        self._client: ModelClient | None = None
        self._judge_client: JudgeClient | None = None

    async def __call__(self, case: dict) -> CaseResult:
        # Clients are made on first use, inside the event loop that runs the cases.
        if self._client is None:
            self._client = make_client(self.offline)
        if self.budget.exhausted():
            return CaseResult(case["id"], case["category"], False, [], 0.0, 0.0, [], skipped=True)
        try:
            result = await run_case(case, self._client)
        except Exception as error:  # noqa: BLE001
            return CaseResult(
                case["id"], case["category"], False, [f"crashed: {error}"], 0.0, 0.0, []
            )
        self.budget.spent += result.cost_usd
        names = case.get("judge", [])
        if names and not self.offline:
            if self._judge_client is None:
                self._judge_client = JudgeClient()
            try:
                verdicts = await asyncio.gather(
                    *(self._judge_client.judge(self.judges[n], result.transcript) for n in names)
                )
            except Exception as error:  # noqa: BLE001
                result.failures.append(f"judge crashed: {error}")
                result.passed = False
                return result
            result.judges = [v.__dict__ for v in verdicts]
            judge_cost = sum(v.cost_usd for v in verdicts)
            result.cost_usd = round(result.cost_usd + judge_cost, 5)
            self.budget.spent += judge_cost
        return result


def run_local(
    cases: list[dict], evaluate: Evaluator, repeat: int, concurrency: int, label: str = ""
) -> list:
    async def go() -> list[CaseResult]:
        semaphore = asyncio.Semaphore(concurrency)

        async def guarded(case: dict) -> CaseResult:
            async with semaphore:
                return await evaluate(case)

        return await asyncio.gather(*(guarded(c) for c in cases for _ in range(repeat)))

    return asyncio.run(go())


def run_in_langfuse(
    cases: list[dict], evaluate: Evaluator, repeat: int, concurrency: int, label: str = ""
) -> list:
    """Runs the cases as a Langfuse experiment: dataset items where they exist (so runs
    line up in the dataset's comparison view), and the judges' verdicts as scores."""
    from langfuse import Evaluation

    langfuse = tracing.client()
    by_id = {c["id"]: c for c in cases}
    try:
        items = [
            i
            for i in langfuse.get_dataset(DATASET).items
            if (i.metadata or {}).get("case_id") in by_id
        ]
    except Exception:  # noqa: BLE001
        items = []
    synced = {i.metadata["case_id"] for i in items}
    missing = [c for c in cases if c["id"] not in synced]
    if missing:
        print(f"Not in the {DATASET} dataset yet, run as local items: {[c['id'] for c in missing]}")
    data = items + [{"input": c["turns"], "metadata": {"case_id": c["id"]}} for c in missing]

    results: dict[str, CaseResult] = {}

    async def task(*, item, **_):
        metadata = item["metadata"] if isinstance(item, dict) else item.metadata
        result = await evaluate(by_id[metadata["case_id"]])
        run_key = uuid.uuid4().hex
        results[run_key] = result
        reply = result.transcript[-1]["assistant"] if result.transcript else None
        return {"case_id": result.id, "reply": reply, "run_key": run_key}

    def judge_scores(*, output, **_):
        result = results[output["run_key"]]
        return [
            Evaluation(name=v["judge"], value=v["passed"], comment=v["reason"], data_type="BOOLEAN")
            for v in result.judges
        ]

    environment = settings().langfuse_tracing_environment
    for n in range(repeat):
        langfuse.run_experiment(
            name="agent-evals",
            run_name=f"{environment} {label or time.strftime('%Y-%m-%d %H:%M:%S')}"
            + (f" #{n + 1}" if repeat > 1 else ""),
            data=data,
            task=task,
            evaluators=[judge_scores],
            max_concurrency=concurrency,
            metadata={"environment": environment, "label": label or "local"},
        )
    tracing.shutdown()
    return list(results.values())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--offline", action="store_true", help="use the offline stand-in model")
    parser.add_argument("--case", action="append", help="run only these case ids")
    parser.add_argument("--judged", action="store_true", help="run only the LLM-judged cases")
    parser.add_argument("--repeat", type=int, default=1, help="runs per case")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument(
        "--max-cost", type=float, help="stop starting new cases after this many dollars"
    )
    parser.add_argument("--label", default="", help="names the Langfuse run, e.g. a PR and commit")
    args = parser.parse_args(argv)

    cases = json.loads(CASES_FILE.read_text())["cases"]
    if args.case:
        cases = [c for c in cases if c["id"] in set(args.case)]
    if args.judged:
        cases = [c for c in cases if c.get("judge")]
    evaluate = Evaluator(offline=args.offline, budget=Budget(args.max_cost))
    in_langfuse = not args.offline and tracing.client() is not None
    run = run_in_langfuse if in_langfuse else run_local
    results = run(cases, evaluate, args.repeat, args.concurrency, args.label)

    ran = [r for r in results if not r.skipped]
    passed = sum(r.passed for r in ran)
    total_cost = sum(r.cost_usd for r in ran)
    for r in results:
        if r.skipped:
            print(f"SKIP  {r.id:<34} over the --max-cost budget")
            continue
        mark = "PASS" if r.passed else "FAIL"
        print(f"{mark}  {r.id:<34} ${r.cost_usd:.4f}  {r.seconds:>5}s")
        for failure in r.failures:
            print(f"        - {failure}")
        for v in r.judges:
            print(
                f"        {'judge ok ' if v['passed'] else 'judge NO '} {v['judge']}: {v['reason']}"
            )
    verdicts = [v for r in ran for v in r.judges]
    print(
        f"\n{passed}/{len(ran)} passed. Total cost ${total_cost:.4f}, "
        f"${total_cost / max(1, len(ran)):.4f} per conversation."
    )
    if verdicts:
        print(f"Judges: {sum(v['passed'] for v in verdicts)}/{len(verdicts)} verdicts passed.")
    skipped = len(results) - len(ran)
    if skipped:
        print(f"{skipped} skipped: the run reached --max-cost ${args.max_cost:.2f}.")

    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    report = RESULTS_DIR / f"{stamp}{'-offline' if args.offline else ''}.json"
    report.write_text(json.dumps([r.__dict__ for r in results], indent=2))
    print(f"Report: {report}")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
