"""MCP analytics: each tool call sends one PostHog event naming the client, and links
handed to a chat app carry utm tags."""

import datetime
from unittest.mock import MagicMock
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from httpx import ASGITransport
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.memory import create_connected_server_and_client_session
from starlette.applications import Starlette

from app import error_tracking
from app.mcp import analytics, server
from app.mcp.limits import AnalysisLimiter, AnalysisLimits
from app.mcp.server import mcp

THIS_YEAR = datetime.date.today().year

SCENARIO = {
    "birth_year": THIS_YEAR - 52,
    "birth_month": 6,
    "filing_status": "married_filing_jointly",
    "spouse_birth_year": THIS_YEAR - 52,
    "spouse_birth_month": 3,
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


@pytest.fixture
def posthog(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", mock)
    return mock


def _events(posthog: MagicMock) -> list[dict]:
    return [
        {"distinct_id": c.kwargs["distinct_id"], **c.kwargs["properties"]}
        for c in posthog.capture.call_args_list
        if c.args[0] == analytics.EVENT
    ]


async def _call(app: Starlette, tool: str, args: dict, user_agent: str):
    http = httpx.AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers={"user-agent": user_agent}
    )
    async with (
        streamable_http_client("http://test/mcp", http_client=http) as (read, write, _),
        ClientSession(read, write) as session,
    ):
        await session.initialize()
        return await session.call_tool(tool, args)


@pytest.mark.parametrize(
    ("user_agent", "client"),
    [
        ("Claude-User", "claude"),
        ("openai-mcp/1.0.0", "chatgpt"),
        ("python-httpx/0.28", "other"),
    ],
)
def test_client_from_user_agent(user_agent, client):
    assert analytics.client_from(user_agent) == client


def test_internal_calls_are_the_web_app():
    assert analytics.client_from("Claude-User", internal=True) == "lucerna_web"


def test_openai_meta_marks_an_unrecognized_client_as_chatgpt():
    token = analytics.current_client.set("other")
    try:
        assert analytics.resolve_client({"openai/subject": "abc"}) == "chatgpt"
        assert analytics.resolve_client({}) == "other"
    finally:
        analytics.current_client.reset(token)


async def test_calls_over_http_send_events_and_tagged_links(posthog, monkeypatch):
    """Over HTTP, as Claude and ChatGPT call it."""
    monkeypatch.setattr(server, "_analysis_limiter", AnalysisLimiter())
    # A session manager runs only once, so this test gets its own MCP app.
    monkeypatch.setattr(mcp, "_session_manager", None)
    app = Starlette(routes=[server.build_route()])
    args = {"scenario": SCENARIO, "user_confirmed": True}
    async with mcp.session_manager.run():
        result = await _call(app, "analyze_roth_conversions", args, user_agent="Claude-User")
        assert not result.isError
        query = parse_qs(urlparse(result.structuredContent["full_results_url"]).query)
        assert query["utm_source"] == ["claude"]
        assert query["utm_medium"] == ["mcp"]
        assert "scenario" in query

        no_analyses = AnalysisLimits(
            per_anonymous_caller_per_day=0,
            per_user_per_day=100,
            anonymous_per_day=3000,
            max_concurrent=2,
            queue_seconds=10,
        )
        monkeypatch.setattr(server, "_analysis_limiter", AnalysisLimiter(no_analyses))
        args = {"scenario": {**SCENARIO, "birth_year": THIS_YEAR - 54}, "user_confirmed": True}
        limited = await _call(app, "analyze_roth_conversions", args, user_agent="openai-mcp/1.0.0")
        assert limited.isError
        assert "utm_source=chatgpt" in limited.structuredContent["full_results_url"]

    claude, chatgpt = _events(posthog)
    assert claude["tool"] == "analyze_roth_conversions"
    assert claude["client"] == "claude"
    assert claude["signed_in"] is False
    assert claude["is_error"] is False
    assert claude["user_agent"] == "Claude-User"
    assert claude["duration_ms"] >= 0
    # Anonymous Claude calls have no per-person id: a fresh id each, no person profile.
    assert claude["distinct_id"].startswith("mcp-anon:")
    assert claude["$process_person_profile"] is False
    assert claude["$geoip_disable"] is True

    assert chatgpt["client"] == "chatgpt"
    assert chatgpt["is_error"] is True
    assert chatgpt["error"] == "daily_limit"
    # Tool arguments never reach PostHog: no birth date, balances or income
    for event in (claude, chatgpt):
        assert not set(event) & set(SCENARIO)
        assert not any("birth" in key for key in event)


async def test_fresh_runs_are_counted_and_cached_ones_are_not(posthog):
    scenario = {**SCENARIO, "birth_year": THIS_YEAR - 53}
    async with create_connected_server_and_client_session(mcp) as session:
        args = {"scenario": scenario, "user_confirmed": True}
        await session.call_tool("analyze_roth_conversions", args)
        await session.call_tool("analyze_roth_conversions", args)
    first, second = _events(posthog)
    assert first["fresh_analyses"] == 1
    assert second["fresh_analyses"] == 0
    # The web assistant connects in process; its links stay untagged.
    assert first["client"] == "lucerna_web"


async def test_errors_are_recorded(posthog):
    async with create_connected_server_and_client_session(mcp) as session:
        result = await session.call_tool(
            "analyze_roth_conversions",
            {"scenario": {"birth_year": THIS_YEAR - 52}, "user_confirmed": True},
        )
    assert result.isError
    [event] = _events(posthog)
    assert event["is_error"] is True
    assert event["error"] == "incomplete"


def test_signed_in_and_chatgpt_ids(posthog):
    analytics.tool_called(
        "list_saved_scenarios",
        client="chatgpt",
        user_id="user_123",
        request_meta={"openai/subject": "s1"},
        properties={},
    )
    analytics.tool_called(
        "prepare_scenario",
        client="chatgpt",
        user_id=None,
        request_meta={"openai/subject": "s1", "openai/locale": "en-US"},
        properties={},
    )
    signed_in, anonymous = _events(posthog)
    # Signed in: the Clerk id the website identifies with, with a person profile.
    assert signed_in["distinct_id"] == "user_123"
    assert "$process_person_profile" not in signed_in
    assert anonymous["distinct_id"] == "chatgpt:s1"
    assert anonymous["locale"] == "en-US"


def test_analytics_failures_never_raise(posthog):
    posthog.capture.side_effect = OSError("network down")
    analytics.tool_called("x", client="claude", user_id=None, request_meta={}, properties={})


def test_no_events_without_a_token(monkeypatch):
    monkeypatch.setattr(error_tracking, "_client", None)
    analytics.tool_called("x", client="claude", user_id=None, request_meta={}, properties={})


async def test_posthog_mcp_analytics_sends_tool_calls_without_inputs(posthog, monkeypatch):
    """$mcp_tool_call for PostHog's MCP Analytics: the tool, outcome and agent intent,
    never the user's numbers. Only ``context`` is added to tool schemas."""
    from mcp.server.fastmcp import FastMCP

    monkeypatch.setattr(analytics, "_handle", None)
    demo = FastMCP("demo")

    @demo.tool()
    def add(a: int, b: int) -> int:
        return a + b

    analytics.instrument(demo, lambda: "user_123")
    async with create_connected_server_and_client_session(demo._mcp_server) as client:
        listed = await client.list_tools()
        schema = listed.tools[0].inputSchema
        assert set(schema["properties"]) == {"a", "b", "context"}
        assert "context" in schema["required"]
        result = await client.call_tool("add", {"a": 2, "b": 3, "context": "Adding two numbers"})
        assert not result.isError
        await analytics.flush()

    calls = [c.kwargs for c in posthog.capture.call_args_list if c.args[0] == "$mcp_tool_call"]
    assert len(calls) == 1
    assert calls[0]["distinct_id"] == "user_123"
    properties = calls[0]["properties"]
    assert properties["$mcp_tool_name"] == "add"
    assert properties["$mcp_intent"] == "Adding two numbers"
    assert "$mcp_parameters" not in properties
    assert "$mcp_response" not in properties


def test_posthog_mcp_analytics_is_off_without_a_token(monkeypatch):
    monkeypatch.setattr(error_tracking, "_client", None)
    monkeypatch.delenv("POSTHOG_PROJECT_TOKEN", raising=False)
    monkeypatch.setattr(analytics, "_handle", None)
    analytics.instrument(MagicMock(), lambda: None)
    assert analytics._handle is None
