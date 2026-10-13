"""MCP Apps host endpoints: View resources, brokered tool calls and the sandbox proxy."""

import json

from app.api.mcp_apps import build_csp
from app.mcp.server import APP_MIME_TYPE, RESULT_CARD_URI

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


async def test_reads_a_view_resource(async_client):
    response = await async_client.get("/api/mcp-apps/resource", params={"uri": RESULT_CARD_URI})
    assert response.status_code == 200
    view = response.json()
    assert view["mimeType"] == APP_MIME_TYPE
    assert view["html"].lstrip().lower().startswith("<!doctype html>")
    assert "https://fonts.gstatic.com" in view["csp"]["resourceDomains"]
    assert view["prefersBorder"] is False


async def test_rejects_non_ui_and_unknown_resources(async_client):
    bad = await async_client.get("/api/mcp-apps/resource", params={"uri": "methodology://rmds"})
    assert bad.status_code == 400
    missing = await async_client.get(
        "/api/mcp-apps/resource", params={"uri": "ui://roth-conversions/nope.html"}
    )
    assert missing.status_code == 404


async def test_brokers_app_visible_tool_calls(async_client):
    response = await async_client.post(
        "/api/mcp-apps/tools/call",
        json={
            "name": "analyze_roth_conversions",
            "arguments": {"scenario": SCENARIO, "user_confirmed": True},
        },
    )
    assert response.status_code == 200
    result = response.json()
    assert result["structuredContent"]["estimated_lifetime_tax_savings_todays_dollars"] > 0
    assert "lucerna/results" not in json.dumps(result.get("_meta", {}))


async def test_sandbox_enforces_declared_csp_and_embedding_origin(async_client):
    csp = {
        "resourceDomains": ["https://fonts.googleapis.com", "javascript:alert(1)"],
        "connectDomains": ["https://api.example.com"],
    }
    response = await async_client.get(
        "/mcp-apps/sandbox",
        params={"csp": json.dumps(csp), "host": "http://localhost:3000"},
    )
    assert response.status_code == 200
    header = response.headers["content-security-policy"]
    assert "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com" in header
    assert "javascript:" not in header
    assert "connect-src https://api.example.com" in header
    assert "frame-ancestors http://localhost:3000" in header
    assert '"http://localhost:3000"' in response.text  # messages only to/from the host

    blocked = await async_client.get("/mcp-apps/sandbox", params={"host": "https://evil.example"})
    assert blocked.status_code == 403
    via_referer = await async_client.get(
        "/mcp-apps/sandbox", headers={"referer": "http://localhost:3000/calculator"}
    )
    assert via_referer.status_code == 200


def test_restrictive_csp_by_default():
    header = build_csp({}, "http://localhost:3000")
    assert "default-src 'none'" in header
    assert "connect-src 'none'" in header
    assert "frame-src 'none'" in header
    assert "object-src 'none'" in header


async def test_view_cannot_call_model_only_tools(async_client, monkeypatch):
    from app.agent.toolbox import McpToolbox

    monkeypatch.setattr(McpToolbox, "visible_to", lambda self, name, audience: audience == "model")
    response = await async_client.post(
        "/api/mcp-apps/tools/call", json={"name": "record_scenario", "arguments": {}}
    )
    assert response.status_code == 403
