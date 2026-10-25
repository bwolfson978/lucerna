"""POST /api/agent (server-sent events) and GET /api/agent/demo."""

import datetime
import json

import pytest

from app.agent import demo
from app.agent.limits import LimitConfig, limiter
from app.agent.model import set_model_client
from tests.agent.fakes import ScriptedModelClient, text, tool_use

THIS_YEAR = datetime.date.today().year


def parse_sse(body: str) -> list[dict]:
    return [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]


@pytest.fixture(autouse=True)
def reset_limits():
    original = limiter.config
    limiter.reset()
    yield
    limiter.config = original
    limiter.reset()
    set_model_client(None)


async def test_streams_events_from_the_loop(async_client):
    set_model_client(
        ScriptedModelClient(
            [
                [tool_use("t1", "prepare_scenario", {"scenario": {"birth_year": THIS_YEAR - 40}})],
                [text("Thanks!")],
            ]
        )
    )
    response = await async_client.post("/api/agent", json={"message": "I'm 40"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = parse_sse(response.text)
    assert [e["type"] for e in events] == ["tool_start", "draft", "text_delta", "done"]
    assert events[1]["draft"]["age"] == 40
    assert len(events[-1]["messages"]) == 4
    assert limiter.spend_today > 0


async def test_unavailable_without_credentials(async_client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("LUCERNA_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("AGENT_OFFLINE", raising=False)
    set_model_client(None)
    events = parse_sse((await async_client.post("/api/agent", json={"message": "hi"})).text)
    assert events[0] == {
        "type": "error",
        "code": "unavailable",
        "message": events[0]["message"],
    }
    assert events[-1] == {"type": "done", "messages": []}


async def test_conversation_limit(async_client):
    limiter.config = LimitConfig(
        messages_per_conversation=1, messages_per_ip_per_day=10, daily_spend_usd=10
    )
    set_model_client(ScriptedModelClient([]))
    history = [
        {"role": "user", "content": [{"type": "text", "text": "a"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "b"}]},
    ]
    events = parse_sse(
        (await async_client.post("/api/agent", json={"message": "c", "messages": history})).text
    )
    assert events[0]["code"] == "conversation_limit"


async def test_daily_ip_limit_uses_forwarded_for(async_client):
    limiter.config = LimitConfig(
        messages_per_conversation=10, messages_per_ip_per_day=1, daily_spend_usd=10
    )
    set_model_client(ScriptedModelClient([[text("one")], [text("two")]]))
    headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}
    first = parse_sse(
        (await async_client.post("/api/agent", json={"message": "a"}, headers=headers)).text
    )
    second = parse_sse(
        (await async_client.post("/api/agent", json={"message": "b"}, headers=headers)).text
    )
    other = parse_sse(
        (
            await async_client.post(
                "/api/agent", json={"message": "c"}, headers={"x-forwarded-for": "198.51.100.1"}
            )
        ).text
    )
    assert first[0]["type"] == "text_delta"
    assert second[0]["code"] == "daily_limit"
    assert other[0]["type"] == "text_delta"


async def test_rejects_oversized_history_and_bad_input(async_client):
    huge = [{"role": "user", "content": "x" * 900_000}]
    events = parse_sse(
        (await async_client.post("/api/agent", json={"message": "a", "messages": huge})).text
    )
    assert events[0]["code"] == "too_long"
    assert (await async_client.post("/api/agent", json={"message": ""})).status_code == 422
    assert (
        await async_client.post(
            "/api/agent", json={"message": "a", "draft": {"birth_year": THIS_YEAR - 500}}
        )
    ).status_code == 422


async def test_demo_endpoint(async_client, monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("LUCERNA_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr(demo, "_CACHE_DIR", tmp_path)
    demo.clear_cache()
    response = await async_client.get("/api/agent/demo")
    assert response.status_code == 200
    data = response.json()
    assert data["persona"]["name"] == "Margaret"
    assert len(data["exchanges"]) == 2
    assert data["draft"]["traditional_balance"] == 1_400_000
    demo.clear_cache()


async def test_chat_endpoint_is_retired(async_client):
    response = await async_client.post("/api/chat", json={"message": "hi", "context": {}})
    assert response.status_code == 404


async def test_ai_generations_carry_usage_and_never_the_conversation(async_client, monkeypatch):
    """PostHog AI Observability: one $ai_generation per model call, on the visitor's
    person and session, with tokens and prices but no prompts or replies."""
    from unittest.mock import MagicMock

    from app import error_tracking

    posthog = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", posthog)
    set_model_client(
        ScriptedModelClient(
            [
                [tool_use("t1", "prepare_scenario", {"scenario": {"birth_year": THIS_YEAR - 40}})],
                [text("Thanks!")],
            ]
        )
    )
    headers = {"x-posthog-distinct-id": "visitor-1", "x-posthog-session-id": "session-1"}
    await async_client.post("/api/agent", json={"message": "I'm 40"}, headers=headers)

    calls = [c.kwargs for c in posthog.capture.call_args_list if c.args[0] == "$ai_generation"]
    assert len(calls) == 2
    first, second = (c["properties"] for c in calls)
    assert {c["distinct_id"] for c in calls} == {"visitor-1"}
    assert first["$ai_trace_id"] == second["$ai_trace_id"]
    assert first["$ai_session_id"] == first["$session_id"] == "session-1"
    assert first["$ai_provider"] == "anthropic"
    assert first["$ai_input_tokens"] == 1000
    assert first["$ai_output_tokens"] == 100
    assert first["$ai_input_token_price"] > 0
    assert first["$ai_latency"] >= 0
    assert first["$ai_is_error"] is False
    assert first["stop_reason"] == "tool_use"
    for props in (first, second):
        assert "$ai_input" not in props
        assert "$ai_output_choices" not in props
        assert "I'm 40" not in json.dumps(props)


async def test_ai_generations_without_visitor_ids_have_no_person(async_client, monkeypatch):
    from unittest.mock import MagicMock

    from app import error_tracking
    from tests.agent.fakes import UNAVAILABLE

    posthog = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", posthog)
    set_model_client(ScriptedModelClient([UNAVAILABLE]))
    await async_client.post("/api/agent", json={"message": "hi"})

    (call,) = [c.kwargs for c in posthog.capture.call_args_list if c.args[0] == "$ai_generation"]
    props = call["properties"]
    assert call["distinct_id"] == props["$ai_trace_id"]
    assert props["$process_person_profile"] is False
    assert props["$ai_is_error"] is True
    assert "$session_id" not in props
