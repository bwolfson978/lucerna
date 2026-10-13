"""The MCP server, exercised the way clients use it: through an MCP client session."""

import json

import httpx
from httpx import ASGITransport, AsyncClient
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.memory import create_connected_server_and_client_session

from app.main import app
from app.mcp import server
from app.mcp.server import RESULTS_META_KEY, UI_META_KEY, mcp
from app.tools.views import VIEW_META_KEY

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}

HEADERS = {"content-type": "application/json", "accept": "application/json, text/event-stream"}


async def test_lists_tools_and_resources():
    async with create_connected_server_and_client_session(mcp) as session:
        tools = (await session.list_tools()).tools
        assert {t.name for t in tools} == {
            "record_scenario",
            "analyze_roth_conversions",
            "compare_roth_scenarios",
            "get_tax_brackets",
            "explain_methodology",
        }
        assert all(t.annotations.readOnlyHint for t in tools)
        uris = {str(r.uri) for r in (await session.list_resources()).resources}
        assert "methodology://rmds" in uris
        resource = await session.read_resource("methodology://irmaa")
        assert "IRMAA" in resource.contents[0].text


async def test_record_then_analyze_with_the_returned_scenario():
    async with create_connected_server_and_client_session(mcp) as session:
        recorded = await session.call_tool("record_scenario", {"scenario": {"age": 52}})
        assert not recorded.isError
        assert recorded.structuredContent["ready_to_run"] is False

        scenario = {**recorded.structuredContent["scenario"], **SCENARIO}
        recorded = await session.call_tool("record_scenario", {"scenario": scenario})
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
            "record_scenario", {"scenario": {**SCENARIO, "state": "ZZ"}}
        )
        assert bad_state.isError and "Unknown state" in bad_state.structuredContent["error"]

        brackets = await session.call_tool(
            "get_tax_brackets", {"filing_status": "single", "state": "zz"}
        )
        assert brackets.isError

        invalid = await session.call_tool("record_scenario", {"scenario": {"age": "old"}})
        assert invalid.isError

        methodology = await session.call_tool("explain_methodology", {"topic": "aca-subsidies"})
        assert "ACA" in methodology.structuredContent["text"]


async def test_http_endpoint_client_and_rate_limit(monkeypatch):
    """Streamable HTTP at /mcp, with a real MCP client. The session manager can only start
    once per process, so this is the one HTTP test."""
    transport = ASGITransport(app=app)
    async with mcp.session_manager.run():
        http = httpx.AsyncClient(transport=transport, base_url="http://test")
        async with (
            streamable_http_client("http://test/mcp", http_client=http) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.call_tool(
                "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}
            )
            assert result.structuredContent["estimated_lifetime_tax_savings_todays_dollars"] > 0

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            monkeypatch.setattr(server, "_requests_per_ip_per_day", lambda: 0)
            body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
            response = await client.post("/mcp", json=body, headers=HEADERS)
            assert response.status_code == 429

            # The web app's own agent (AGENT_MCP_URL) skips the per-IP limit with the
            # shared internal token, and only with the right one.
            monkeypatch.setenv("MCP_INTERNAL_TOKEN", "s3cret")
            wrong = {**HEADERS, server.INTERNAL_HEADER: "nope"}
            assert (await client.post("/mcp", json=body, headers=wrong)).status_code == 429
            internal = {**HEADERS, server.INTERNAL_HEADER: "s3cret"}
            response = await client.post("/mcp", json=body, headers=internal)
            assert response.status_code == 200


async def test_tools_declare_their_views():
    expected = {
        "record_scenario": server.SCENARIO_SUMMARY_URI,
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
