"""MCP analytics: one PostHog event per tool call, with the person and the channel."""

import pytest
from mcp.shared.memory import create_connected_server_and_client_session

from app import analytics
from app.auth.identity import Caller, acting_as, browser_ids
from app.mcp.analytics import WEB_ASSISTANT, detect_channel
from app.mcp.server import mcp

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


async def test_web_assistant_tool_call(posthog):
    with acting_as("user_a", channel=WEB_ASSISTANT, anonymous_id="anon_1", session_id="s_1"):
        async with create_connected_server_and_client_session(mcp) as session:
            await session.list_tools()
            await session.call_tool(
                "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}
            )
    # The site lists tools every turn; only the call is recorded.
    assert [e["event"] for e in posthog.events] == ["$mcp_tool_call"]
    event = posthog.events[0]
    assert event["distinct_id"] == "user_a"  # the signed-in person, not the browser id
    assert event["channel"] == "web_assistant"
    assert event["$mcp_tool_name"] == "analyze_roth_conversions"
    assert event["$mcp_is_error"] is False
    assert event["$mcp_duration_ms"] >= 0
    assert event["$mcp_client_name"] == "roth-conversions-web"
    assert event["$session_id"] == "s_1"
    assert event["signed_in"] is True
    assert event["mcp_transport"] == "in_process"
    # No financial details leave the server.
    assert not any(str(v) in {"600000", "600000.0", "90000", "90000.0"} for v in event.values())
    assert "scenario" not in event and "$mcp_parameters" not in event


async def test_signed_out_visitor_is_their_browser(posthog):
    with acting_as(None, channel=WEB_ASSISTANT, anonymous_id="anon_1"):
        async with create_connected_server_and_client_session(mcp) as session:
            await session.call_tool("save_scenario", {"scenario": SCENARIO})
    event = posthog.events[-1]
    assert event["distinct_id"] == "anon_1"
    assert event["signed_in"] is False
    assert event["$mcp_is_error"] is True
    assert event["$mcp_error_type"] == "sign_in_required"


async def test_other_clients_and_listing(posthog):
    async with create_connected_server_and_client_session(mcp) as session:
        await session.list_tools()
        await session.call_tool(
            "analyze_roth_conversions", {"scenario": {"age": 5}, "user_confirmed": True}
        )
    listing, call = posthog.events
    assert listing["event"] == "$mcp_tools_list"
    assert "analyze_roth_conversions" in listing["$mcp_listed_tool_names"]
    assert call["channel"] == "mcp_other"
    assert call["distinct_id"] is None  # no person: recorded without a profile
    assert call["$mcp_error_type"] == "missing_required"


async def test_analytics_failures_never_break_tools(posthog, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("posthog down")

    monkeypatch.setattr(posthog, "capture", boom)
    async with create_connected_server_and_client_session(mcp) as session:
        result = await session.call_tool("get_tax_brackets", {"filing_status": "single"})
    assert not result.isError


@pytest.mark.parametrize(
    ("caller", "client_name", "headers", "channel"),
    [
        (Caller(channel=WEB_ASSISTANT), None, {"user-agent": "Claude-User"}, "web_assistant"),
        (
            Caller(oauth_client_id="https://claude.ai/oauth/mcp-oauth-client-metadata"),
            None,
            {},
            "claude",
        ),
        (Caller(), None, {"x-anthropic-client": "claude-desktop"}, "claude"),
        (Caller(), "claude-ai", {}, "claude"),
        (Caller(), None, {"user-agent": "openai-mcp/1.0.0"}, "chatgpt"),
        (Caller(oauth_client_id="client_abc"), "ChatGPT", {}, "chatgpt"),
        (Caller(), "cursor", {"user-agent": "node"}, "mcp_other"),
    ],
)
def test_detect_channel(caller, client_name, headers, channel):
    assert detect_channel(caller, client_name=client_name, headers=headers) == channel


def test_browser_ids_are_validated():
    assert browser_ids({"x-posthog-distinct-id": "abc", "x-posthog-session-id": "s1"}) == {
        "anonymous_id": "abc",
        "session_id": "s1",
    }
    assert browser_ids({"x-posthog-distinct-id": "x" * 500}) == {}
    assert browser_ids({"x-posthog-distinct-id": "a\nb"}) == {}
    assert browser_ids({}) == {}


def test_client_is_off_without_a_token(monkeypatch):
    monkeypatch.delenv("POSTHOG_PROJECT_TOKEN", raising=False)
    assert analytics.client() is None
    analytics.capture("x", distinct_id=None, properties={})  # no-op


def test_client_with_a_token(monkeypatch):
    monkeypatch.setenv("POSTHOG_PROJECT_TOKEN", "phc_test")
    monkeypatch.setenv("POSTHOG_HOST", "http://127.0.0.1:9")
    try:
        client = analytics.client()
        assert client is not None and analytics.client() is client
    finally:
        analytics.shutdown()
    monkeypatch.delenv("POSTHOG_PROJECT_TOKEN")
    assert analytics.client() is None
