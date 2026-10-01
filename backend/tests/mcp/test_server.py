"""Remote MCP server: tool behavior in process and the streamable HTTP endpoint."""

import json

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.mcp import server
from app.mcp.server import mcp

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}

HEADERS = {"content-type": "application/json", "accept": "application/json, text/event-stream"}


def payload(result) -> dict:
    """FastMCP call_tool returns (content, structured) for dict-returning tools."""
    content, structured = result
    return (
        structured.get("result", structured)
        if isinstance(structured, dict)
        else json.loads(content[0].text)
    )


async def test_lists_tools_and_resources():
    names = {t.name for t in await mcp.list_tools()}
    assert names == {
        "analyze_roth_conversions",
        "compare_roth_scenarios",
        "get_tax_brackets",
        "explain_methodology",
    }
    for tool in await mcp.list_tools():
        assert tool.annotations.readOnlyHint is True
    uris = {str(r.uri) for r in await mcp.list_resources()}
    assert "methodology://rmds" in uris


async def test_analyze_returns_engine_summary():
    data = payload(await mcp.call_tool("analyze_roth_conversions", {"scenario": SCENARIO}))
    assert data["estimated_lifetime_tax_savings_todays_dollars"] > 0
    assert data["inputs_used"]["age"] == 52


async def test_analyze_reports_missing_inputs():
    data = payload(await mcp.call_tool("analyze_roth_conversions", {"scenario": {"age": 52}}))
    assert data["missing_required"] == [
        "filing_status",
        "current_income",
        "traditional_balance",
        "retirement_age",
    ]


async def test_compare_and_reference_tools():
    data = payload(
        await mcp.call_tool(
            "compare_roth_scenarios",
            {"scenario": SCENARIO, "changes": {"retirement_age": 58}, "label": "Retire at 58"},
        )
    )
    assert data["label"] == "Retire at 58"
    assert "difference" in data["estimated_lifetime_tax_savings"]
    data = payload(
        await mcp.call_tool("get_tax_brackets", {"filing_status": "single", "state": "zz"})
    )
    assert "error" in data
    content = await mcp.call_tool("explain_methodology", {"topic": "aca-subsidies"})
    assert "ACA" in json.dumps([c.model_dump() for c in content[0]])
    resource = await mcp.read_resource("methodology://irmaa")
    assert "IRMAA" in list(resource)[0].content


async def test_bad_state_in_scenario_is_an_error():
    data = payload(
        await mcp.call_tool("analyze_roth_conversions", {"scenario": {**SCENARIO, "state": "ZZ"}})
    )
    assert "Unknown state" in data["error"]


async def test_http_endpoint_and_rate_limit(monkeypatch):
    # The session manager can only start once per process, so this is the one HTTP test.
    transport = ASGITransport(app=app)
    async with (
        mcp.session_manager.run(),
        AsyncClient(transport=transport, base_url="http://test") as client,
    ):
        body = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
        response = await client.post("/mcp", json=body, headers=HEADERS)
        assert response.status_code == 200
        assert "analyze_roth_conversions" in response.text

        monkeypatch.setattr(server, "_requests_per_ip_per_day", lambda: 0)
        response = await client.post("/mcp", json=body, headers=HEADERS)
        assert response.status_code == 429
