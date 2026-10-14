"""The /demo conversation: Margaret describes her situation and the agent answers.

The opening exchange is produced by the real agent loop and cached, keyed by the
prompt, tool definitions, engine source, model and script. It is replayed to
every visitor; any follow-up question they ask runs live. A change to any part of
the key regenerates it.

Without model access (local development, an outage) the same loop and MCP tools
run with a fixed-wording stand-in for the model, so the demo always shows real
engine output and its history is valid for live follow-ups.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from collections.abc import AsyncIterator
from pathlib import Path

from app.agent.loop import run_turn
from app.agent.model import (
    MODEL,
    AnthropicModelClient,
    Final,
    ModelClient,
    ModelTurn,
    ModelUnavailable,
    StreamEvent,
    TextDelta,
    ToolStart,
    has_credentials,
)
from app.agent.prompts import PROMPT_VERSION
from app.engine.demo import DEMO_PERSONA
from app.tools import core
from app.tools.draft import ScenarioDraft, current_year
from app.tools.models import ScenarioUpdate

_APP_DIR = Path(__file__).resolve().parents[1]

logger = logging.getLogger(__name__)

DEMO_MESSAGES: tuple[str, ...] = (
    "Hi, I'm Margaret. I'm 63 and my husband and I file jointly. I retired last year after "
    "35 years as a nurse, and we're living off our brokerage account, so our income is only "
    "about $20,000 a year until Social Security starts. I have $1.4 million in a traditional "
    "401(k) and $52,000 in a Roth IRA. I'll claim Social Security at 67, about $46,000 a year, "
    "and my husband's adds about $14,000 a year starting the year after. We plan to start "
    "drawing on the 401(k) at 73, spend about $95,000 a year in retirement, and plan through "
    "age 93. How much should I convert to Roth, and when?",
    "That all looks right. Run the numbers.",
)

# What the scripted fallback records from Margaret's message. Matches the facts in
# DEMO_MESSAGES[0]; the real agent extracts the same values itself.
_SCRIPTED_SCENARIO = ScenarioUpdate(
    age=63,
    filing_status="married_filing_jointly",
    current_income=20_000,
    income_growth_rate_pct=0,
    traditional_balance=1_400_000,
    roth_balance=52_000,
    retirement_age=73,
    retirement_spending=95_000,
    planning_horizon_age=93,
    current_income_end_age=66,
    income_sources=[
        {"kind": "social_security", "owner": "you", "amount": 46_000, "start_age": 67},
        {"kind": "social_security", "owner": "spouse", "amount": 14_000, "start_age": 68},
    ],
)

_CACHE_DIR = Path(os.environ.get("AGENT_CACHE_DIR", Path(__file__).resolve().parents[2] / ".cache"))
_lock = threading.Lock()
_memory: dict[str, dict] = {}


def cache_key() -> str:
    material = json.dumps(
        {
            "prompt": PROMPT_VERSION,
            "tools": _tools_version(),
            "engine": core.engine_version(),
            "model": MODEL,
            "messages": DEMO_MESSAGES,
            "year": current_year(),
        },
        sort_keys=True,
    )
    return hashlib.sha256(material.encode()).hexdigest()[:16]


def _tools_version() -> str:
    """Hash of the MCP server and tool code, standing in for the tool definitions."""
    digest = hashlib.sha256()
    for path in sorted(
        [
            _APP_DIR / "mcp" / "server.py",
            _APP_DIR / "agent" / "toolbox.py",
            *(_APP_DIR / "tools").glob("*.py"),
        ]
    ):
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def persona() -> dict:
    return {
        "name": DEMO_PERSONA["name"],
        "age": DEMO_PERSONA["age"],
        "occupation": DEMO_PERSONA["occupation"],
        "situation": DEMO_PERSONA["situation"],
    }


async def generate_with_agent(client: ModelClient, source: str = "agent") -> dict:
    """Run the scripted user messages through the real agent loop and MCP tools."""
    history: list[dict] = []
    draft = ScenarioDraft()
    exchanges = []
    for text in DEMO_MESSAGES:
        events = []
        async for event in run_turn(client=client, history=history, text=text, draft=draft):
            if event["type"] == "error":
                raise ModelUnavailable(event["code"])
            if event["type"] == "draft":
                draft = ScenarioDraft.model_validate(event["draft"])
            if event["type"] == "done":
                history.extend(event["messages"])
            else:
                events.append(event)
        exchanges.append({"user": text, "events": events})
    return _package(exchanges, history, draft, source=source)


async def generate_scripted() -> dict:
    """Fallback without model access: the real loop and tools with fixed wording."""
    return await generate_with_agent(ScriptedDemoClient(), source="scripted")


class ScriptedDemoClient:
    """Plays the model's part in the demo with fixed wording. Tool calls and every number
    in the replies come from the real tools."""

    async def stream(
        self, *, system: str, tools: list[dict], messages: list[dict]
    ) -> AsyncIterator[StreamEvent]:
        content = self._respond(messages)
        for block in content:
            if block["type"] == "text":
                yield TextDelta(block["text"])
            else:
                yield ToolStart(block["name"])
        stop = "tool_use" if any(b["type"] == "tool_use" for b in content) else "end_turn"
        yield Final(ModelTurn(content=content, stop_reason=stop, model="scripted"))

    def _respond(self, messages: list[dict]) -> list[dict]:
        last = messages[-1]["content"]
        results = {b["tool_use_id"]: b for b in last if b.get("type") == "tool_result"}
        if not results:
            if DEMO_MESSAGES[0] in json.dumps(last):
                scenario = _SCRIPTED_SCENARIO.model_dump(mode="json", exclude_none=True)
                return [_tool_use("toolu_demo_1", "prepare_scenario", {"scenario": scenario})]
            scenario = _last_scenario(messages)
            return [
                _tool_use(
                    "toolu_demo_3",
                    "analyze_roth_conversions",
                    {"scenario": scenario, "user_confirmed": True},
                )
            ]
        first = next(iter(results.values()))
        data = json.loads(first["content"])
        if "toolu_demo_1" in results:
            return [
                _text(
                    "Thanks, Margaret. Your situation has a long, low-income window before "
                    "required distributions begin, which is exactly where conversions can help. "
                    "Here's what I recorded. Check it over, and if it looks right I'll run the "
                    "numbers."
                ),
                _tool_use("toolu_demo_2", "show", {"kind": "scenario_summary"}),
            ]
        if "toolu_demo_2" in results:
            return [_text("Ready when you are.")]
        if "toolu_demo_3" in results:
            return [
                _text(_explanation(data)),
                _tool_use(
                    "toolu_demo_5",
                    "show",
                    {
                        "kind": "suggestions",
                        "suggestions": [
                            "What if we spend $70,000 a year instead?",
                            "How do RMDs change with these conversions?",
                            "Why not convert everything this year?",
                        ],
                    },
                ),
            ]
        return [_text("Ask me anything about these results.")]


def _last_scenario(messages: list[dict]) -> dict:
    for message in reversed(messages):
        for block in message["content"] if isinstance(message["content"], list) else []:
            if block.get("type") == "tool_result":
                data = json.loads(block["content"])
                if isinstance(data.get("scenario"), dict):
                    return data["scenario"]
    return _SCRIPTED_SCENARIO.model_dump(mode="json", exclude_none=True)


def _explanation(summary: dict) -> str:
    points = summary["reasoning"]["summary_points"]
    return (
        f"The analysis shows estimated lifetime tax savings of "
        f"${summary['estimated_lifetime_tax_savings_todays_dollars']:,} in today's dollars "
        f"compared with not converting.\n\n"
        f"{_schedule_sentence(summary)} {_sentence(points['why_this_amount'])}\n\n"
        f"{_sentence(points['key_tradeoff'])} The chart below shows how each year's "
        "conversion fills the lower brackets."
    )


def _package(exchanges: list[dict], history: list[dict], draft: ScenarioDraft, source: str) -> dict:
    return {
        "persona": persona(),
        "exchanges": exchanges,
        "messages": history,
        "draft": draft.model_dump(mode="json"),
        "source": source,
        "cache_key": cache_key(),
    }


async def get_demo_conversation() -> dict:
    """Cached demo conversation, generating it on first use."""
    key = cache_key()
    if key in _memory:
        return _memory[key]
    cached = _read_disk(key)
    if cached is not None:
        _memory[key] = cached
        return cached

    demo: dict | None = None
    if has_credentials():
        try:
            demo = await generate_with_agent(AnthropicModelClient())
        except Exception:  # noqa: BLE001 - any failure falls back to the scripted version
            logger.exception("Demo generation with the agent failed; using the scripted version")
    if demo is None:
        demo = await generate_scripted()

    with _lock:
        _memory[key] = demo
    if demo["source"] == "agent":
        _write_disk(key, demo)
    return demo


def clear_cache() -> None:
    with _lock:
        _memory.clear()


def _read_disk(key: str) -> dict | None:
    path = _CACHE_DIR / f"demo-conversation-{key}.json"
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def _write_disk(key: str, demo: dict) -> None:
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (_CACHE_DIR / f"demo-conversation-{key}.json").write_text(json.dumps(demo))
    except OSError:
        logger.warning("Could not write the demo cache to %s", _CACHE_DIR)


def _schedule_sentence(summary: dict) -> str:
    rows = [r for r in summary["schedule_by_year"] if r["conversion"] > 0]
    if not rows:
        return "In this scenario the analysis finds no conversion worth making."
    largest = sorted(rows, key=lambda r: r["conversion"], reverse=True)[:2]
    largest_years = " and ".join(str(r["year"]) for r in sorted(largest, key=lambda r: r["year"]))
    return (
        f"The schedule converts a total of ${summary['total_conversion']:,} over "
        f"{len(rows)} years, from {rows[0]['year']} to {rows[-1]['year']}, with the largest "
        f"conversions in {largest_years} (about ${largest[0]['conversion']:,} at the peak)."
    )


def _sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else text + "."


def _tool_use(tool_id: str, name: str, payload: dict) -> dict:
    return {"type": "tool_use", "id": tool_id, "name": name, "input": payload}


def _text(text: str) -> dict:
    return {"type": "text", "text": text}
