"""The /demo conversation: Margaret describes her situation and the agent answers.

The opening exchange is produced by the real agent loop and cached, keyed by the
prompt, tool definitions, engine source, model and script. It is replayed to
every visitor; any follow-up question they ask runs live. A change to any part of
the key regenerates it.

Without model access (local development, an outage) the exchange is built
directly from the tools with fixed wording, so the demo always shows real engine
output and its history is valid for live follow-ups.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import threading
from pathlib import Path

from app.agent.loop import run_turn
from app.agent.model import MODEL, AnthropicModelClient, ModelClient, ModelUnavailable
from app.agent.prompts import PROMPT_VERSION
from app.engine.demo import DEMO_PERSONA
from app.tools import core
from app.tools.draft import ScenarioDraft
from app.tools.models import ScenarioUpdate
from app.tools.registry import anthropic_tools

logger = logging.getLogger(__name__)

DEMO_START_YEAR = 2026

DEMO_MESSAGES: tuple[str, ...] = (
    "Hi, I'm Margaret. I'm 63 and my husband and I file jointly. I retired last year after "
    "35 years as a nurse, and we're living off our brokerage account, so our income is only "
    "about $20,000 a year right now. I have $1.4 million in a traditional 401(k) and $52,000 "
    "in a Roth IRA. We'll start Social Security in 2030 at about $46,000 a year, about $58,000 "
    "in 2031 once my husband claims, and about $60,000 a year after that. We plan to start "
    "drawing on the 401(k) at 73, spend about $95,000 a year in retirement, and plan through "
    "age 93. How much should I convert to Roth, and when?",
    "That all looks right. Run the numbers.",
)

# What the scripted fallback records from Margaret's message. Matches the facts in
# DEMO_MESSAGES[0]; the real agent extracts the same values itself.
_SCRIPTED_UPDATE = ScenarioUpdate(
    age=63,
    filing_status="married_filing_jointly",
    current_income=20_000,
    income_growth_rate_pct=0,
    traditional_balance=1_400_000,
    roth_balance=52_000,
    retirement_age=73,
    retirement_spending=95_000,
    planning_horizon_age=93,
    income_changes=[
        {"year": 2030, "gross_income": 46_000, "note": "Social Security starts"},
        {"year": 2031, "gross_income": 58_000, "note": "Spouse claims Social Security"},
        {"year": 2032, "gross_income": 60_000, "note": "Full Social Security"},
        {"year": 2033, "gross_income": 60_000, "note": "Full Social Security"},
        {"year": 2034, "gross_income": 60_000, "note": "Full Social Security"},
        {"year": 2035, "gross_income": 60_000, "note": "Full Social Security"},
    ],
)

_CACHE_DIR = Path(os.environ.get("AGENT_CACHE_DIR", Path(__file__).resolve().parents[2] / ".cache"))
_lock = threading.Lock()
_memory: dict[str, dict] = {}


def cache_key() -> str:
    material = json.dumps(
        {
            "prompt": PROMPT_VERSION,
            "tools": anthropic_tools(),
            "engine": core.engine_version(),
            "model": MODEL,
            "messages": DEMO_MESSAGES,
            "start_year": DEMO_START_YEAR,
        },
        sort_keys=True,
    )
    return hashlib.sha256(material.encode()).hexdigest()[:16]


def persona() -> dict:
    return {
        "name": DEMO_PERSONA["name"],
        "age": DEMO_PERSONA["age"],
        "occupation": DEMO_PERSONA["occupation"],
        "situation": DEMO_PERSONA["situation"],
    }


async def generate_with_agent(client: ModelClient) -> dict:
    """Run the scripted user messages through the real agent loop."""
    history: list[dict] = []
    draft = ScenarioDraft()
    exchanges = []
    for text in DEMO_MESSAGES:
        events = []
        async for event in run_turn(
            client=client, history=history, text=text, draft=draft, start_year=DEMO_START_YEAR
        ):
            if event["type"] == "error":
                raise ModelUnavailable(event["code"])
            if event["type"] == "draft":
                draft = ScenarioDraft.model_validate(event["draft"])
            if event["type"] == "done":
                history.extend(event["messages"])
            else:
                events.append(event)
        exchanges.append({"user": text, "events": events})
    return _package(exchanges, history, draft, source="agent")


def generate_scripted() -> dict:
    """Engine-backed fallback with fixed wording (no model call)."""
    draft = core.apply_update(ScenarioDraft(), _SCRIPTED_UPDATE, DEMO_START_YEAR)
    described = core.describe_draft(draft)
    scenario, result = core.run_draft(draft)
    result_id = core.result_id_for(scenario)
    summary = core.summarize_result(result, result_id)
    points = summary["reasoning"]["summary_points"]
    draft_json = draft.model_dump(mode="json")

    intro = (
        "Thanks, Margaret. Your situation has a long, low-income window before required "
        "distributions begin, which is exactly where conversions can help. Here's what I "
        "recorded. Check it over, and if it looks right I'll run the numbers."
    )
    explanation = (
        f"The analysis shows estimated lifetime tax savings of "
        f"${summary['estimated_lifetime_tax_savings_todays_dollars']:,} in today's dollars "
        f"compared with not converting.\n\n"
        f"{_schedule_sentence(summary)} {_sentence(points['why_this_amount'])}\n\n"
        f"{_sentence(points['key_tradeoff'])} The chart below shows how each year's "
        "conversion fills the lower brackets."
    )
    suggestions = [
        "What if we spend $70,000 a year instead?",
        "How do RMDs change with these conversions?",
        "Why not convert everything this year?",
    ]

    update_input = _SCRIPTED_UPDATE.model_dump(mode="json", exclude_none=True)
    history = [
        {"role": "user", "content": [{"type": "text", "text": DEMO_MESSAGES[0]}]},
        {
            "role": "assistant",
            "content": [_tool_use("toolu_demo_1", "update_scenario", update_input)],
        },
        {"role": "user", "content": [_tool_result("toolu_demo_1", described)]},
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": intro},
                _tool_use("toolu_demo_2", "show", {"kind": "scenario_summary"}),
            ],
        },
        {
            "role": "user",
            "content": [
                _tool_result(
                    "toolu_demo_2",
                    {"shown": "scenario_summary", "draft_hash": described["draft_hash"]},
                )
            ],
        },
        {"role": "assistant", "content": [{"type": "text", "text": "Ready when you are."}]},
        {"role": "user", "content": [{"type": "text", "text": DEMO_MESSAGES[1]}]},
        {
            "role": "assistant",
            "content": [_tool_use("toolu_demo_3", "optimize_scenario", {"user_confirmed": True})],
        },
        {"role": "user", "content": [_tool_result("toolu_demo_3", summary)]},
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": explanation},
                _tool_use("toolu_demo_4", "show", {"kind": "bracket_fill", "result_id": result_id}),
                _tool_use(
                    "toolu_demo_5", "show", {"kind": "suggestions", "suggestions": suggestions}
                ),
            ],
        },
        {
            "role": "user",
            "content": [
                _tool_result("toolu_demo_4", {"shown": "bracket_fill", "result_id": result_id}),
                _tool_result("toolu_demo_5", {"shown": "suggestions"}),
            ],
        },
        {
            "role": "assistant",
            "content": [{"type": "text", "text": "Ask me anything about these results."}],
        },
    ]
    exchanges = [
        {
            "user": DEMO_MESSAGES[0],
            "events": [
                {"type": "draft", "draft": draft_json, "missing": []},
                {"type": "text_delta", "text": intro},
                {
                    "type": "part",
                    "part": {
                        "kind": "scenario_summary",
                        "draft": draft_json,
                        "draft_hash": described["draft_hash"],
                    },
                },
                {"type": "text_delta", "text": "Ready when you are."},
            ],
        },
        {
            "user": DEMO_MESSAGES[1],
            "events": [
                {
                    "type": "result",
                    "result_id": result_id,
                    "label": "Your scenario",
                    "result": result.model_dump(mode="json"),
                },
                {"type": "part", "part": {"kind": "result_headline", "result_id": result_id}},
                {"type": "text_delta", "text": explanation},
                {"type": "part", "part": {"kind": "bracket_fill", "result_id": result_id}},
                {"type": "part", "part": {"kind": "suggestions", "suggestions": suggestions}},
            ],
        },
    ]
    return _package(exchanges, history, draft, source="scripted")


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
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        try:
            demo = await generate_with_agent(AnthropicModelClient())
        except Exception:  # noqa: BLE001 - any failure falls back to the scripted version
            logger.exception("Demo generation with the agent failed; using the scripted version")
    if demo is None:
        demo = await asyncio.to_thread(generate_scripted)

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


def _tool_result(tool_id: str, content: dict) -> dict:
    return {
        "type": "tool_result",
        "tool_use_id": tool_id,
        "content": json.dumps(content, separators=(",", ":")),
    }
