"""The web assistant's MCP toolbox: tool listing, UI events and the local show tool."""

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
        assert context.events[-1]["part"]["kind"] == "scenario_compare"
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
