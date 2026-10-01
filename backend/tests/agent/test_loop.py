"""Agent loop: event stream, tool dispatch, history shape and failure handling."""

import json

from app.agent.loop import (
    MAX_MODEL_CALLS_PER_TURN,
    build_user_turn,
    count_user_messages,
    known_result_ids,
    last_seen_draft_hash,
    run_turn,
)
from app.agent.prompts import PROMPT_VERSION, SYSTEM_PROMPT
from app.tools import core
from app.tools.draft import ScenarioDraft
from tests.agent.fakes import UNAVAILABLE, ScriptedModelClient, text, tool_use

READY = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


async def collect(client, text_in="hello", history=None, draft=None, on_usage=None):
    events = []
    async for event in run_turn(
        client=client,
        history=history or [],
        text=text_in,
        draft=draft or ScenarioDraft(),
        start_year=2026,
        on_usage=on_usage,
    ):
        events.append(event)
    return events


def done_messages(events):
    assert events[-1]["type"] == "done"
    return events[-1]["messages"]


def assert_well_formed(messages):
    """Roles alternate and every tool_use has a matching tool_result next."""
    assert messages[0]["role"] == "user"
    for prev, nxt in zip(messages, messages[1:], strict=False):
        assert prev["role"] != nxt["role"]
        uses = [b["id"] for b in prev["content"] if b.get("type") == "tool_use"]
        if uses:
            results = [b["tool_use_id"] for b in nxt["content"] if b.get("type") == "tool_result"]
            assert results == uses


async def test_text_only_turn_streams_and_returns_history():
    client = ScriptedModelClient([[text("Hi there.")]])
    usage = []
    events = await collect(client, on_usage=lambda model, u: usage.append((model, u)))
    assert [e["type"] for e in events] == ["text_delta", "done"]
    messages = done_messages(events)
    assert messages[0] == {"role": "user", "content": [{"type": "text", "text": "hello"}]}
    assert messages[1]["role"] == "assistant"
    assert client.calls[0]["system"] == SYSTEM_PROMPT
    assert usage and usage[0][0] == "claude-sonnet-5-5"


async def test_full_intake_and_run_flow():
    client = ScriptedModelClient(
        [
            [tool_use("t1", "update_scenario", READY)],
            [text("Here's your scenario."), tool_use("t2", "show", {"kind": "scenario_summary"})],
            [text("Check it and tap Run the numbers.")],
        ]
    )
    events = await collect(client, text_in="I'm 52...")
    types = [e["type"] for e in events]
    assert "draft" in types
    parts = [e["part"]["kind"] for e in events if e["type"] == "part"]
    assert parts == ["scenario_summary"]
    messages = done_messages(events)
    assert_well_formed(messages)
    draft = ScenarioDraft.model_validate(next(e for e in events if e["type"] == "draft")["draft"])

    run_client = ScriptedModelClient(
        [
            [tool_use("t3", "optimize_scenario", {"user_confirmed": True})],
            [text("The analysis shows...")],
        ]
    )
    events = await collect(run_client, text_in="Run the numbers", history=messages, draft=draft)
    result_event = next(e for e in events if e["type"] == "result")
    assert isinstance(result_event["result"], dict)  # serialized for the wire
    assert result_event["result"]["estimated_lifetime_tax_savings"] > 0
    json.dumps(events)  # everything is JSON-serializable
    tool_result = done_messages(events)[2]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert result_event["result_id"] in tool_result["content"]


async def test_tool_errors_are_returned_to_the_model():
    client = ScriptedModelClient(
        [
            [tool_use("t1", "optimize_scenario", {"user_confirmed": True})],
            [text("I need more info.")],
        ]
    )
    events = await collect(client)
    result = done_messages(events)[2]["content"][0]
    assert result["is_error"] is True
    assert "missing" in json.loads(result["content"])["error"]


async def test_model_unavailable_yields_error_and_empty_history():
    events = await collect(ScriptedModelClient([UNAVAILABLE]))
    assert events[0]["type"] == "error" and events[0]["code"] == "unavailable"
    assert done_messages(events) == []


async def test_refusal_drops_the_exchange():
    events = await collect(ScriptedModelClient([([text("partial")], "refusal")]))
    assert any(e["type"] == "error" and e["code"] == "refusal" for e in events)
    assert done_messages(events) == []


async def test_truncated_tool_call_gets_an_error_result():
    client = ScriptedModelClient(
        [
            ([tool_use("t1", "update_scenario", {"age": 5})], "max_tokens"),
            [text("Sorry, retrying.")],
        ]
    )
    events = await collect(client)
    messages = done_messages(events)
    assert_well_formed(messages)
    assert messages[2]["content"][0]["is_error"] is True
    assert not any(e["type"] == "draft" for e in events)  # the tool never ran


async def test_runaway_tool_loop_is_capped_and_closed():
    turns = [
        [tool_use(f"t{i}", "get_tax_brackets", {"filing_status": "single"})] for i in range(20)
    ]
    client = ScriptedModelClient(turns)
    events = await collect(client)
    messages = done_messages(events)
    assert len(client.calls) == MAX_MODEL_CALLS_PER_TURN
    assert messages[-1]["role"] == "assistant"
    assert_well_formed(messages)


async def test_scenario_state_injected_only_when_draft_changed():
    draft = core.apply_update(ScenarioDraft(), core.ScenarioUpdate(**READY), 2026)
    turn = build_user_turn("hi", draft, [])
    assert turn["content"][0]["text"].startswith("<scenario_state>")
    assert turn["content"][-1]["text"] == "hi"

    history = [turn, {"role": "assistant", "content": [text("ok")]}]
    assert last_seen_draft_hash(history) == core.describe_draft(draft)["draft_hash"]
    assert len(build_user_turn("again", draft, history)["content"]) == 1

    assert len(build_user_turn("hi", ScenarioDraft(), [])["content"]) == 1  # nothing entered


def test_history_helpers():
    history = [
        {"role": "user", "content": [text("a")]},
        {"role": "assistant", "content": [tool_use("t1", "show", {"result_id": "r_0123456789"})]},
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "{}"}],
        },
        {"role": "assistant", "content": [text("b")]},
        {"role": "user", "content": "plain string"},
    ]
    assert count_user_messages(history) == 2
    assert known_result_ids(history) == {"r_0123456789"}


def test_prompt_rules():
    assert "you should" in SYSTEM_PROMPT  # the rule itself names the phrase to avoid
    assert "—" not in SYSTEM_PROMPT
    assert len(PROMPT_VERSION) == 12
