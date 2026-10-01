"""Tool layer: schemas, updates, optimization, comparisons and displays."""

import json
from pathlib import Path

import pytest

from app.engine.types import ScenarioInput
from app.tools import core
from app.tools.draft import ScenarioDraft
from app.tools.models import MethodologyTopic, ScenarioUpdate
from app.tools.registry import TOOLS, ToolContext, anthropic_tools, run_tool

REPO = Path(__file__).resolve().parents[3]

READY = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


def ctx(**draft) -> ToolContext:
    return ToolContext(draft=ScenarioDraft(**draft), start_year=2026)


def ready_ctx() -> ToolContext:
    context = ctx()
    content, is_error = run_tool("update_scenario", READY, context)
    assert not is_error, content
    return context


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------


def test_every_tool_has_a_generated_object_schema():
    names = [t["name"] for t in anthropic_tools()]
    assert names == [
        "update_scenario",
        "optimize_scenario",
        "compare_scenarios",
        "get_tax_brackets",
        "explain_methodology",
        "show",
    ]
    for tool in anthropic_tools():
        assert tool["input_schema"]["type"] == "object"
        assert tool["description"]
        assert not _has_key(tool["input_schema"], "title")


def _has_key(node, key: str) -> bool:
    if isinstance(node, dict):
        return key in node or any(_has_key(v, key) for v in node.values())
    if isinstance(node, list):
        return any(_has_key(v, key) for v in node)
    return False


def test_update_covers_every_draft_field():
    """Anything the form can set, the conversation can set too."""
    draft_fields = set(ScenarioDraft.model_fields) - {"timeline"}
    update_fields = set(ScenarioUpdate.model_fields) - {"income_changes"}
    assert draft_fields == update_fields


def test_methodology_topics_match_content():
    ids = [t["id"] for t in core.methodology_topics()]
    assert sorted(ids) == sorted(t.value for t in MethodologyTopic)


def test_frontend_methodology_copy_is_identical():
    backend = REPO / "backend" / "app" / "content" / "methodology.json"
    frontend = REPO / "frontend" / "src" / "content" / "methodology.json"
    if not frontend.exists():
        pytest.skip("frontend not checked out")
    assert backend.read_text() == frontend.read_text()


def test_methodology_copy_has_no_em_dashes():
    text = (REPO / "backend" / "app" / "content" / "methodology.json").read_text()
    assert "—" not in text


# --------------------------------------------------------------------------
# update_scenario
# --------------------------------------------------------------------------


def test_update_records_values_and_reports_missing():
    context = ctx()
    content, is_error = run_tool("update_scenario", {"age": 52, "filing_status": "single"}, context)
    assert not is_error
    assert content["missing_required"] == [
        "current_income",
        "traditional_balance",
        "retirement_age",
    ]
    assert content["ready_to_run"] is False
    assert context.draft.age == 52
    assert context.events[-1]["type"] == "draft"


def test_update_builds_timeline_and_applies_income_changes():
    context = ready_ctx()
    content, is_error = run_tool(
        "update_scenario",
        {"income_changes": [{"year": 2028, "gross_income": 20000, "note": "Sabbatical"}]},
        context,
    )
    assert not is_error
    row = next(r for r in content["timeline"] if r["year"] == 2028)
    assert row == {"year": 2028, "gross_income": 20000.0, "note": "Sabbatical"}
    assert content["ready_to_run"] is True


def test_income_change_outside_timeline_is_an_error():
    context = ready_ctx()
    content, is_error = run_tool(
        "update_scenario",
        {"income_changes": [{"year": 2040, "gross_income": 1, "note": "x"}]},
        context,
    )
    assert is_error
    assert "outside the timeline" in content["error"]


@pytest.mark.parametrize(
    ("given", "state", "retirement_state"),
    [("ca", "CA", "CA"), ("none", None, None), ("Custom", "custom", "custom")],
)
def test_state_normalization(given, state, retirement_state):
    context = ctx()
    _, is_error = run_tool("update_scenario", {"state": given}, context)
    assert not is_error
    assert context.draft.state == state
    assert context.draft.retirement_state == retirement_state


def test_unknown_state_and_bad_types_are_errors():
    assert run_tool("update_scenario", {"state": "ZZ"}, ctx())[1] is True
    content, is_error = run_tool("update_scenario", {"age": "old"}, ctx())
    assert is_error and content["error"] == "Invalid input"
    content, is_error = run_tool("update_scenario", {"favorite_color": "blue"}, ctx())
    assert is_error


def test_unknown_tool():
    content, is_error = run_tool("nope", {}, ctx())
    assert is_error and "Unknown tool" in content["error"]


# --------------------------------------------------------------------------
# optimize, compare, show
# --------------------------------------------------------------------------


def test_optimize_requires_confirmation_and_complete_scenario():
    assert run_tool("optimize_scenario", {"user_confirmed": False}, ready_ctx())[1] is True
    content, is_error = run_tool("optimize_scenario", {"user_confirmed": True}, ctx())
    assert is_error and "missing" in content["error"]


def test_optimize_returns_summary_and_emits_result():
    context = ready_ctx()
    content, is_error = run_tool("optimize_scenario", {"user_confirmed": True}, context)
    assert not is_error
    assert content["result_id"].startswith("r_")
    assert content["estimated_lifetime_tax_savings_todays_dollars"] > 0
    assert len(json.dumps(content)) < 12_000
    kinds = [(e["type"], e.get("part", {}).get("kind")) for e in context.events]
    assert ("result", None) in kinds
    assert ("part", "result_headline") in kinds
    assert content["result_id"] in context.results


def test_compare_leaves_scenario_unchanged():
    context = ready_ctx()
    before = context.draft.model_copy(deep=True)
    content, is_error = run_tool(
        "compare_scenarios", {"label": "Retire at 58", "changes": {"retirement_age": 58}}, context
    )
    assert not is_error
    assert context.draft == before
    assert content["base_result_id"] != content["variant_result_id"]
    part = next(e["part"] for e in context.events if e["type"] == "part")
    assert part["kind"] == "scenario_compare"
    variant_event = next(
        e for e in context.events if e.get("result_id") == content["variant_result_id"]
    )
    assert variant_event["draft"]["retirement_age"] == 58


def test_show_validates_kind_requirements():
    context = ctx()
    assert run_tool("show", {"kind": "scenario_summary"}, context)[1] is True
    assert run_tool("show", {"kind": "bracket_fill"}, context)[1] is True
    assert run_tool("show", {"kind": "bracket_fill", "result_id": "r_0000000000"}, context)[1]
    assert run_tool("show", {"kind": "suggestions", "suggestions": []}, context)[1] is True

    context = ready_ctx()
    content, is_error = run_tool("show", {"kind": "scenario_summary"}, context)
    assert not is_error and content["draft_hash"]
    context.known_result_ids.add("r_0123456789")
    assert (
        run_tool("show", {"kind": "balance_comparison", "result_id": "r_0123456789"}, context)[1]
        is False
    )
    assert (
        run_tool("show", {"kind": "suggestions", "suggestions": ["What if?"]}, context)[1] is False
    )


def test_reference_tools():
    content, is_error = run_tool(
        "get_tax_brackets", {"filing_status": "single", "state": "TX"}, ctx()
    )
    assert not is_error
    assert content["state"] == {"code": "TX", "has_income_tax": False}
    assert content["federal"]["brackets_on_taxable_income"][0]["rate"] == 0.10
    content, is_error = run_tool("explain_methodology", {"topic": "irmaa"}, ctx())
    assert not is_error and "IRMAA" in content["text"]
    assert run_tool("get_tax_brackets", {"filing_status": "single", "state": "ZZ"}, ctx())[1]


def test_result_cache_returns_same_object(sample_single_input):
    scenario: ScenarioInput = sample_single_input()
    assert core.run_optimization(scenario) is core.run_optimization(scenario)


def test_status_lines_exist_for_every_tool():
    assert all(tool.status for tool in TOOLS)
