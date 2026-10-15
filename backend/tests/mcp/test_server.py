"""The MCP server, exercised the way clients use it: through an MCP client session."""

import json
from unittest.mock import MagicMock

import httpx
from httpx import ASGITransport
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.memory import create_connected_server_and_client_session

from app import error_tracking
from app.main import app
from app.mcp import server
from app.mcp.limits import AnalysisLimiter, AnalysisLimits, current_caller
from app.mcp.server import RESULTS_META_KEY, UI_META_KEY, mcp
from app.tools import feedback
from app.tools.views import VIEW_META_KEY

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


def _limits(per_ip: int) -> AnalysisLimits:
    return AnalysisLimits(
        per_anonymous_caller_per_day=per_ip,
        per_user_per_day=100,
        anonymous_per_day=3000,
        max_concurrent=2,
        queue_seconds=10,
    )


async def test_lists_tools_and_resources():
    async with create_connected_server_and_client_session(mcp) as session:
        tools = (await session.list_tools()).tools
        assert {t.name for t in tools} == {
            "prepare_scenario",
            "analyze_roth_conversions",
            "compare_roth_scenarios",
            "get_tax_brackets",
            "explain_methodology",
            "save_scenario",
            "list_saved_scenarios",
            "open_saved_scenario",
            "send_feedback",
            "report_problem",
        }
        writes = {"save_scenario", "send_feedback", "report_problem"}
        assert all(t.annotations.readOnlyHint for t in tools if t.name not in writes)
        assert not any(t.annotations.destructiveHint for t in tools if t.name in writes)
        # Directory reviews flag tools without a title or with any hint left unset.
        for tool in tools:
            assert tool.title, tool.name
            hints = tool.annotations
            assert None not in (hints.readOnlyHint, hints.destructiveHint, hints.openWorldHint)
            assert hints.title == tool.title, tool.name
            # Claude's directory check also flags parameters without a "type".
            for param, schema in tool.inputSchema.get("properties", {}).items():
                assert "type" in schema or "anyOf" in schema, (tool.name, param)
        uris = {str(r.uri) for r in (await session.list_resources()).resources}
        assert "methodology://rmds" in uris
        resource = await session.read_resource("methodology://irmaa")
        assert "IRMAA" in resource.contents[0].text


async def test_record_then_analyze_with_the_returned_scenario():
    async with create_connected_server_and_client_session(mcp) as session:
        recorded = await session.call_tool("prepare_scenario", {"scenario": {"age": 52}})
        assert not recorded.isError
        assert recorded.structuredContent["ready_to_run"] is False

        scenario = {**recorded.structuredContent["scenario"], **SCENARIO}
        recorded = await session.call_tool("prepare_scenario", {"scenario": scenario})
        assert recorded.structuredContent["ready_to_run"] is True

        analyzed = await session.call_tool(
            "analyze_roth_conversions",
            {"scenario": recorded.structuredContent["scenario"], "user_confirmed": True},
        )
        data = analyzed.structuredContent
        assert data["estimated_lifetime_tax_savings_todays_dollars"] > 0
        assert data["scenario"]["age"] == 52
        # Chart series for the View ride in _meta; the full engine output only when the
        # client asks for UI payloads.
        assert set(analyzed.meta) == {VIEW_META_KEY}
        view = analyzed.meta[VIEW_META_KEY]
        assert len(view["bracket_fill"]["years"]) == len(data["schedule_by_year"])
        assert view["bracket_fill"]["brackets"][0]["rate"] == 0.10
        # The text content mirrors the structured content for clients that read text.
        assert json.loads(analyzed.content[0].text) == data


async def test_ui_payloads_on_request():
    async with create_connected_server_and_client_session(mcp) as session:
        analyzed = await session.call_tool(
            "analyze_roth_conversions",
            {"scenario": SCENARIO, "user_confirmed": True},
            meta={UI_META_KEY: True},
        )
        [entry] = analyzed.meta[RESULTS_META_KEY]
        assert entry["result_id"] == analyzed.structuredContent["result_id"]
        assert entry["result"]["conversion_curve"]  # the full result, not the summary

        compared = await session.call_tool(
            "compare_roth_scenarios",
            {"scenario": SCENARIO, "changes": {"retirement_age": 58}, "label": "Retire at 58"},
            meta={UI_META_KEY: True},
        )
        data = compared.structuredContent
        assert data["label"] == "Retire at 58"
        assert data["what_if_scenario"]["retirement_age"] == 58
        assert [e["label"] for e in compared.meta[RESULTS_META_KEY]] == [
            "Your scenario",
            "Retire at 58",
        ]


def _survey_sent(posthog) -> dict:
    """kwargs of the last feedback event (tool calls also send mcp_tool_called)."""
    calls = [c for c in posthog.capture.call_args_list if c.args[0] == "survey sent"]
    return calls[-1].kwargs


async def test_feedback_from_the_web_assistant(monkeypatch):
    posthog = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", posthog)
    feedback.limiter.reset()
    async with create_connected_server_and_client_session(mcp) as session:
        sent = await session.call_tool("send_feedback", {"message": "Very clear"})
        assert sent.structuredContent["sent"] is True
        assert "won't be a reply" in sent.structuredContent["note"]
        assert _survey_sent(posthog)["properties"]["source"] == "lucerna_web"
        empty = await session.call_tool("send_feedback", {"message": " "})
        assert empty.isError
    feedback.limiter.reset()


async def test_errors_are_tool_errors():
    async with create_connected_server_and_client_session(mcp) as session:
        incomplete = await session.call_tool(
            "analyze_roth_conversions", {"scenario": {"age": 52}, "user_confirmed": True}
        )
        assert incomplete.isError
        assert incomplete.structuredContent["missing_required"][0] == "filing_status"

        unconfirmed = await session.call_tool(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": False}
        )
        assert unconfirmed.isError

        bad_state = await session.call_tool(
            "prepare_scenario", {"scenario": {**SCENARIO, "state": "ZZ"}}
        )
        assert bad_state.isError and "Unknown state" in bad_state.structuredContent["error"]

        brackets = await session.call_tool(
            "get_tax_brackets", {"filing_status": "single", "state": "zz"}
        )
        assert brackets.isError

        invalid = await session.call_tool("prepare_scenario", {"scenario": {"age": "old"}})
        assert invalid.isError

        methodology = await session.call_tool("explain_methodology", {"topic": "aca-subsidies"})
        assert "ACA" in methodology.structuredContent["text"]


async def test_http_endpoint_client_and_analysis_limits(monkeypatch):
    """Streamable HTTP at /mcp, with a real MCP client. The session manager can only start
    once per process, so this is the one HTTP test."""
    monkeypatch.setattr(server, "_analysis_limiter", AnalysisLimiter(_limits(per_ip=1)))
    transport = ASGITransport(app=app)

    async def call(tool: str, args: dict, headers: dict | None = None):
        http = httpx.AsyncClient(transport=transport, base_url="http://test", headers=headers)
        async with (
            streamable_http_client("http://test/mcp", http_client=http) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            return await session.call_tool(tool, args)

    async with mcp.session_manager.run():
        first = {**SCENARIO, "age": 47}
        result = await call("analyze_roth_conversions", {"scenario": first, "user_confirmed": True})
        assert result.structuredContent["estimated_lifetime_tax_savings_todays_dollars"] > 0

        # Cached results, and tools that don't run the optimizer, don't count.
        again = await call("analyze_roth_conversions", {"scenario": first, "user_confirmed": True})
        assert not again.isError
        assert not (await call("prepare_scenario", {"scenario": SCENARIO})).isError

        # A fresh analysis over the limit gets a message and a way to keep going.
        second = {**SCENARIO, "age": 48}
        limited = await call(
            "analyze_roth_conversions", {"scenario": second, "user_confirmed": True}
        )
        assert limited.isError
        data = limited.structuredContent
        assert data["limit_reached"] == "daily_limit"
        assert "today's limit of 1 analyses" in data["error"]
        assert data["resets_at"]
        assert "/calculator?" in data["full_results_url"]

        # Another address has its own allowance.
        other = await call(
            "analyze_roth_conversions",
            {"scenario": second, "user_confirmed": True},
            {"x-forwarded-for": "203.0.113.9"},
        )
        assert not other.isError

        # The web app's own agent (AGENT_MCP_URL) skips the per-caller limits with the
        # shared internal token, and only with the right one.
        monkeypatch.setenv("MCP_INTERNAL_TOKEN", "s3cret")
        third = {**SCENARIO, "age": 49}
        args = {"scenario": third, "user_confirmed": True}
        wrong = await call("analyze_roth_conversions", args, {server.INTERNAL_HEADER: "nope"})
        assert wrong.isError
        internal = await call("analyze_roth_conversions", args, {server.INTERNAL_HEADER: "s3cret"})
        assert not internal.isError

        # Signed in: the token reaches the account tools as the user.
        monkeypatch.setenv("MCP_AUTH_ISSUER", "https://clerk.example.com")
        monkeypatch.setattr(server.mcp_auth, "verify_access_token", lambda token: "user_9")
        seen = []

        async def list_for(user_id):
            seen.append(user_id)
            return []

        monkeypatch.setattr(server.saved_store, "list_for", list_for)
        listed = await call("list_saved_scenarios", {}, {"authorization": "Bearer t0ken"})
        assert listed.structuredContent["scenarios"] == [] and seen == ["user_9"]

        # Feedback is open to everyone, says which app it came from, and is limited per
        # caller; a signed-in user's report is filed under their account.
        posthog = MagicMock()
        monkeypatch.setattr(error_tracking, "_client", posthog)
        monkeypatch.setattr(feedback, "limiter", feedback.FeedbackLimiter(per_caller=1))
        report = {"what_happened": "The chart is blank", "expected": "A chart"}
        claude = {"user-agent": "Claude-User"}
        sent = await call("report_problem", report, claude)
        assert sent.structuredContent["sent"] is True
        kwargs = _survey_sent(posthog)
        assert kwargs["properties"]["source"] == "claude"
        assert kwargs["distinct_id"].startswith("feedback-anon:")
        assert (await call("report_problem", report, claude)).isError
        signed_in = await call(
            "send_feedback",
            {"message": "Love it", "email": "a@b.co"},
            {"authorization": "Bearer t0ken", "user-agent": "openai-mcp/1.0"},
        )
        assert "may reply" in signed_in.structuredContent["note"]
        kwargs = _survey_sent(posthog)
        assert kwargs["distinct_id"] == "user_9"
        assert kwargs["properties"]["source"] == "chatgpt"


async def test_compare_counts_only_fresh_runs(monkeypatch):
    monkeypatch.setattr(server, "_analysis_limiter", AnalysisLimiter(_limits(per_ip=1)))
    base = {**SCENARIO, "age": 50}
    args = {"scenario": base, "changes": {"retirement_age": 62}, "label": "Retire at 62"}

    async def call(caller: str | None, tool: str, arguments: dict):
        # The caller is read in the server's task, which copies the context it starts in.
        token = current_caller.set(caller)
        try:
            async with create_connected_server_and_client_session(mcp) as session:
                return await session.call_tool(tool, arguments)
        finally:
            current_caller.reset(token)

    limited = await call("ip:198.51.100.7", "compare_roth_scenarios", args)
    assert limited.structuredContent["limit_reached"] == "daily_limit"
    # With the base already computed, the what-if is the only fresh run.
    await call(None, "analyze_roth_conversions", {"scenario": base, "user_confirmed": True})
    compared = await call("ip:198.51.100.7", "compare_roth_scenarios", args)
    assert not compared.isError


async def test_tools_declare_their_views():
    expected = {
        "prepare_scenario": server.SCENARIO_SUMMARY_URI,
        "analyze_roth_conversions": server.RESULT_CARD_URI,
        "compare_roth_scenarios": server.SCENARIO_COMPARE_URI,
    }
    async with create_connected_server_and_client_session(mcp) as session:
        tools = {t.name: t for t in (await session.list_tools()).tools}
        for name, uri in expected.items():
            assert tools[name].meta["ui"]["resourceUri"] == uri
            assert tools[name].meta["ui"]["visibility"] == ["model", "app"]
        for uri, *_ in server.VIEWS:
            read = await session.read_resource(uri)
            content = read.contents[0]
            assert content.mimeType == server.APP_MIME_TYPE
            assert '<div id="root">' in content.text
            assert content.meta["ui"]["csp"] == server.VIEW_CSP


async def test_server_advertises_icons():
    async with create_connected_server_and_client_session(mcp) as session:
        info = (await session.initialize()).serverInfo
        assert info.icons and {i.mimeType for i in info.icons} == {"image/svg+xml", "image/png"}
        assert all(str(i.src).startswith("https://www.") for i in info.icons)
        assert info.websiteUrl == "https://www.rothconversionsoptimizer.com"
