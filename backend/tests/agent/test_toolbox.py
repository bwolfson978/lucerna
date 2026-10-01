"""The web assistant's MCP toolbox: tool listing, UI events and the local show tool."""

import pytest

from app.agent.toolbox import ToolContext, open_toolbox
from app.tools.draft import ScenarioDraft

SCENARIO = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


def ctx() -> ToolContext:
    return ToolContext(draft=ScenarioDraft(), start_year=2026)


async def test_lists_server_tools_plus_show():
    async with open_toolbox() as toolbox:
        names = [t["name"] for t in toolbox.definitions]
        assert names[-1] == "show"
        assert {"record_scenario", "analyze_roth_conversions", "compare_roth_scenarios"} <= set(
            names
        )
        for tool in toolbox.definitions:
            assert tool["input_schema"]["type"] == "object"
            assert "title" not in tool["input_schema"]


async def test_mcp_results_become_browser_events():
    context = ctx()
    async with open_toolbox() as toolbox:
        content, is_error = await toolbox.call("record_scenario", {"scenario": SCENARIO}, context)
        assert not is_error and content["ready_to_run"]
        assert context.events[-1]["type"] == "draft"
        assert context.draft.age == 52

        content, is_error = await toolbox.call("show", {"kind": "scenario_summary"}, context)
        assert not is_error
        assert context.events[-1]["part"]["kind"] == "scenario_summary"

        content, is_error = await toolbox.call(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}, context
        )
        assert not is_error
        result_event = next(e for e in context.events if e["type"] == "result")
        assert result_event["result"]["estimated_lifetime_tax_savings"] > 0
        assert "conversion_curve" not in content  # the model gets the summary only

        content, is_error = await toolbox.call(
            "compare_roth_scenarios",
            {"scenario": SCENARIO, "changes": {"retirement_age": 58}, "label": "Retire at 58"},
            context,
        )
        assert not is_error
        variant = next(
            e for e in context.events if e.get("result_id") == content["variant_result_id"]
        )
        assert variant["draft"]["retirement_age"] == 58
        compare_part = context.events[-1]["part"]
        assert compare_part["kind"] == "mcp_app"
        assert compare_part["resource_uri"] == "ui://roth-conversions/scenario-compare.html"
        assert context.draft.retirement_age == 60  # a what-if never changes the scenario


async def test_errors_and_show_validation():
    context = ctx()
    async with open_toolbox() as toolbox:
        assert (await toolbox.call("nope", {}, context))[1] is True
        assert (await toolbox.call("record_scenario", {"scenario": {"age": "x"}}, context))[1]
        assert (await toolbox.call("show", {"kind": "scenario_summary"}, context))[1]
        assert (await toolbox.call("show", {"kind": "bracket_fill"}, context))[1]
        assert (await toolbox.call("show", {"kind": "suggestions", "suggestions": []}, context))[1]
        assert (await toolbox.call("show", {"kind": "unknown"}, context))[1]
        context.known_result_ids.add("r_0123456789")
        content, is_error = await toolbox.call(
            "show", {"kind": "balance_comparison", "result_id": "r_0123456789"}, context
        )
        assert not is_error


async def test_show_notes_when_nothing_was_written_yet():
    context = ctx()
    context.known_result_ids.add("r_0123456789")
    suggestions = {"kind": "suggestions", "suggestions": ["What if I retire at 60?"]}
    async with open_toolbox() as toolbox:
        content, is_error = await toolbox.call("show", suggestions, context)
        assert not is_error and "not seen any text" in content["note"]
        chart = {"kind": "bracket_fill", "result_id": "r_0123456789"}
        content, is_error = await toolbox.call("show", chart, context)
        assert not is_error and "not seen any text" in content["note"]

        context.wrote_text = True
        assert await toolbox.call("show", suggestions, context) == ({"shown": "suggestions"}, False)
        content, _ = await toolbox.call("show", chart, context)
        assert "note" not in content


async def test_ui_tool_results_become_mcp_app_parts():
    context = ctx()
    async with open_toolbox() as toolbox:
        assert toolbox.ui_tools == {
            "record_scenario": "ui://roth-conversions/scenario-summary.html",
            "analyze_roth_conversions": "ui://roth-conversions/result-card.html",
            "compare_roth_scenarios": "ui://roth-conversions/scenario-compare.html",
        }
        # This host renders the scenario summary natively, so no View part for it.
        await toolbox.call("record_scenario", {"scenario": SCENARIO}, context)
        assert not [e for e in context.events if e["type"] == "part"]
        content, is_error = await toolbox.call(
            "analyze_roth_conversions", {"scenario": SCENARIO, "user_confirmed": True}, context
        )
    assert not is_error
    part = next(e["part"] for e in context.events if e["type"] == "part")
    assert part["kind"] == "mcp_app"
    assert part["resource_uri"] == "ui://roth-conversions/result-card.html"
    assert part["tool_input"]["user_confirmed"] is True
    view_data = part["tool_result"]
    assert view_data["structuredContent"]["result_id"] == content["result_id"]
    # Full results stay with the host; the View gets only its chart series.
    assert set(view_data["_meta"]) == {"lucerna/view"}
    # The model gets the text content, which carries the same summary.
    assert content["estimated_lifetime_tax_savings_todays_dollars"] > 0


class _FakeSession:
    def __init__(self, tools):
        self._tools = tools

    async def list_tools(self):
        from types import SimpleNamespace

        return SimpleNamespace(tools=self._tools)

    async def call_tool(self, name, arguments, meta=None):  # pragma: no cover - not reached
        raise AssertionError("should not be called")


async def test_visibility_scopes_tools_to_model_or_app():
    from mcp.types import Tool

    from app.agent.toolbox import McpToolbox

    schema = {"type": "object", "properties": {}}
    tools = [
        Tool(name="both", inputSchema=schema),
        Tool(name="app_only", inputSchema=schema, _meta={"ui": {"visibility": ["app"]}}),
        Tool(name="model_only", inputSchema=schema, _meta={"ui": {"visibility": ["model"]}}),
    ]
    toolbox = McpToolbox(_FakeSession(tools))
    await toolbox.load()
    names = [t["name"] for t in toolbox.definitions]
    assert "app_only" not in names and {"both", "model_only"} <= set(names)
    # The model can't reach an app-only tool, and a View can't reach a model-only one.
    content, is_error = await toolbox.call("app_only", {}, ctx())
    assert is_error and "Unknown tool" in content["error"]
    import pytest

    with pytest.raises(PermissionError):
        await toolbox.call_from_app("model_only", {})


async def test_http_mode_sends_the_internal_token(monkeypatch):
    """Over HTTP (AGENT_MCP_URL), the agent's calls carry the internal token so the
    server's per-IP limit doesn't count the backend calling itself."""
    from contextlib import asynccontextmanager

    import mcp.client.streamable_http as streamable_http

    from app.agent import toolbox as toolbox_module
    from app.mcp.server import INTERNAL_HEADER

    seen = {}

    @asynccontextmanager
    async def fake_client(url, *, http_client=None, **_):
        seen["url"] = url
        seen["header"] = http_client.headers.get(INTERNAL_HEADER)
        raise RuntimeError("stop here")
        yield  # pragma: no cover

    monkeypatch.setattr(streamable_http, "streamable_http_client", fake_client)
    monkeypatch.setenv("AGENT_MCP_URL", "http://localhost:8000/mcp")
    monkeypatch.setenv("MCP_INTERNAL_TOKEN", "s3cret")
    with pytest.raises(RuntimeError, match="stop here"):
        async with toolbox_module.open_toolbox():
            pass  # pragma: no cover
    assert seen == {"url": "http://localhost:8000/mcp", "header": "s3cret"}
