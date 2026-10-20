"""Tool core: scenario updates, the stateless scenario format, results and reference data."""

from pathlib import Path

import pytest

from app.engine.types import FilingStatus, ScenarioInput
from app.tools import core
from app.tools.draft import ScenarioDraft, generate_timeline
from app.tools.models import MethodologyTopic, ScenarioUpdate

REPO = Path(__file__).resolve().parents[3]

READY = ScenarioUpdate(
    age=52,
    filing_status="married_filing_jointly",
    current_income=90000,
    traditional_balance=600000,
    retirement_age=60,
)


def ready_draft() -> ScenarioDraft:
    return core.draft_from_scenario(READY, 2026)


def test_update_covers_every_draft_field():
    """Anything the form can set, a tool call can set too."""
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
    assert "—" not in backend.read_text()


# --------------------------------------------------------------------------
# Updates and the stateless scenario
# --------------------------------------------------------------------------


def test_describe_reports_missing_and_ready():
    partial = core.draft_from_scenario(ScenarioUpdate(age=52, filing_status="single"), 2026)
    described = core.describe_draft(partial, 2026)
    assert described["missing_required"] == [
        "current_income",
        "traditional_balance",
        "retirement_age",
    ]
    assert described["ready_to_run"] is False
    assert core.describe_draft(ready_draft(), 2026)["ready_to_run"] is True


RETIRED = ScenarioUpdate(
    age=66,
    filing_status="married_filing_jointly",
    state="FL",
    current_income=0,
    traditional_balance=2_600_000,
    roth_balance=80_000,
    retirement_age=65,
    retirement_spending=130_000,
    income_sources=[
        {"kind": "social_security", "owner": "you", "amount": 42_000, "start_age": 67},
        {"kind": "social_security", "owner": "spouse", "amount": 30_000, "start_age": 67},
    ],
)


def test_retiree_with_no_work_income_is_ready_and_runs():
    """$0 income from work is a valid answer, not a missing one (bug review #5)."""
    draft = core.draft_from_scenario(RETIRED, 2026)
    described = core.describe_draft(draft, 2026)
    assert described["missing_required"] == []
    assert described["ready_to_run"] is True
    assert draft.timeline[0].gross_income == 0
    assert draft.timeline[1].social_security == 72_000

    scenario, result = core.run_draft(draft)
    assert scenario.timeline[0].gross_income == 0
    # With no other income the first year has the most low-bracket room to convert.
    first = result.yearly_detail[0]
    assert first["conversion"] > 0
    assert result.reasoning_trace is not None

    # The stateless scenario round-trips without turning every $0 year into an income change.
    assert "income_changes" not in core.scenario_from_draft(draft, 2026)


def test_zero_work_income_is_accepted_by_the_tool_schema():
    assert ScenarioUpdate(current_income=0).current_income == 0
    with pytest.raises(ValueError):
        ScenarioUpdate(current_income=-1)


def test_income_changes_inside_and_directly_after_timeline():
    draft = core.apply_update(
        ready_draft(),
        ScenarioUpdate(
            income_changes=[
                {"year": 2028, "gross_income": 20000, "note": "Sabbatical"},
                {"year": 2034, "gross_income": 10000, "note": "Part-time", "state": "tx"},
            ]
        ),
        2026,
    )
    rows = {r.year: r for r in draft.timeline}
    assert rows[2028].gross_income == 20000 and rows[2028].notes == "Sabbatical"
    assert rows[2034].state == "TX"  # 2034 extends the 2026-2033 projection


def test_income_change_outside_timeline_is_an_error():
    with pytest.raises(core.ToolError, match="outside the timeline"):
        core.apply_update(
            ready_draft(),
            ScenarioUpdate(income_changes=[{"year": 2100, "gross_income": 1, "note": "x"}]),
            2026,
        )


@pytest.mark.parametrize(
    ("given", "state", "retirement_state"),
    [("ca", "CA", "CA"), ("none", None, None), ("Custom", "custom", "custom")],
)
def test_state_normalization(given, state, retirement_state):
    draft = core.apply_update(ScenarioDraft(), ScenarioUpdate(state=given), 2026)
    assert (draft.state, draft.retirement_state) == (state, retirement_state)


def test_unknown_state_is_an_error():
    with pytest.raises(core.ToolError, match="Unknown state"):
        core.apply_update(ScenarioDraft(), ScenarioUpdate(state="ZZ"), 2026)


def test_scenario_round_trip_keeps_form_edits():
    draft = core.apply_update(
        ready_draft(),
        ScenarioUpdate(income_changes=[{"year": 2030, "gross_income": 1, "note": "Leave"}]),
        2026,
    )
    # A form edit without a note, and a per-year state override.
    draft.timeline[1] = draft.timeline[1].model_copy(update={"gross_income": 5})
    draft.timeline[2] = draft.timeline[2].model_copy(update={"state": "NY"})
    scenario = core.scenario_from_draft(draft, 2026)
    rebuilt = core.draft_from_scenario(ScenarioUpdate.model_validate(scenario), 2026)
    assert [(r.year, r.gross_income, r.state) for r in rebuilt.timeline] == [
        (r.year, r.gross_income, r.state) for r in draft.timeline
    ]
    assert rebuilt.timeline[1].notes == core.EDITED_NOTE


def test_plain_projection_needs_no_income_changes():
    assert "income_changes" not in core.scenario_from_draft(ready_draft(), 2026)


def test_website_input_round_trips_with_inflation():
    inputs = core.scenario_input(ready_draft())
    scenario = core.scenario_from_input(inputs, 2026)
    assert scenario["inflation_pct"] == 2.5
    assert scenario["income_growth_rate_pct"] == 3
    assert "income_changes" not in scenario


def test_website_input_saved_before_inflation_gets_the_default():
    """Its incomes were projected without inflation: only real edits carry over."""
    timeline = generate_timeline(52, 60, 90000, 3, 2026)
    timeline[3] = timeline[3].model_copy(update={"gross_income": 10, "notes": "Leave"})
    inputs = ScenarioInput.model_validate(
        {
            "age": 52,
            "filing_status": "married_filing_jointly",
            "timeline": [row.model_dump() for row in timeline],
            "traditional_ira_balance": 600000,
            "drawdown_start_age": 60,
        }
    )
    scenario = core.scenario_from_input(inputs, 2026)
    assert "inflation_pct" not in scenario
    assert scenario["income_growth_rate_pct"] == 3
    assert [c["year"] for c in scenario["income_changes"]] == [2029]
    draft = core.draft_from_scenario(ScenarioUpdate.model_validate(scenario), 2026)
    assert draft.inflation_pct == 2.5


# --------------------------------------------------------------------------
# Results and reference data
# --------------------------------------------------------------------------


def test_run_draft_and_summary():
    scenario, result = core.run_draft(ready_draft())
    summary = core.summarize_result(result, core.result_id_for(scenario))
    assert summary["result_id"].startswith("r_")
    assert summary["estimated_lifetime_tax_savings_todays_dollars"] > 0
    with pytest.raises(core.ToolError, match="missing"):
        core.run_draft(ScenarioDraft())


def test_summary_gives_later_conversions_in_that_years_dollars():
    scenario, result = core.run_draft(ready_draft())
    summary = core.summarize_result(result, core.result_id_for(scenario))
    assert summary["assumptions"]["inflation"] == pytest.approx(0.025)
    assert summary["assumptions"]["amounts_in"] == "today's dollars"
    later = [
        (t, row) for t, row in enumerate(summary["schedule_by_year"]) if t > 0 and row["conversion"]
    ]
    assert later
    for t, row in later:
        want = round(result.yearly_conversions[t] * 1.025**t)
        assert row["conversion_in_that_years_dollars"] == want
    assert "conversion_in_that_years_dollars" not in summary["schedule_by_year"][0]


def test_compare_results():
    base_input, base = core.run_draft(ready_draft())
    variant_draft = core.apply_update(ready_draft(), ScenarioUpdate(retirement_age=58), 2026)
    variant_input, variant = core.run_draft(variant_draft)
    comparison = core.compare_results(
        base,
        variant,
        core.result_id_for(base_input),
        core.result_id_for(variant_input),
        "Retire at 58",
    )
    assert comparison["base_result_id"] != comparison["variant_result_id"]
    assert "difference" in comparison["estimated_lifetime_tax_savings"]
    for side, result in (("current", base), ("what_if", variant)):
        breakdown = comparison["tax_breakdown"][side]
        assert breakdown["paid_now"] > 0
        # The two bars net to the headline savings.
        assert breakdown["avoided_later"] - breakdown["paid_now"] == round(
            result.estimated_lifetime_tax_savings
        )


def test_reference_data():
    brackets = core.tax_brackets(FilingStatus.SINGLE, "TX")
    assert brackets["state"] == {"code": "TX", "has_income_tax": False}
    assert brackets["federal"]["brackets_on_taxable_income"][0]["rate"] == 0.10
    assert "IRMAA" in core.methodology_text("irmaa")
    with pytest.raises(core.ToolError):
        core.tax_brackets(FilingStatus.SINGLE, "ZZ")


def test_result_cache_returns_same_object(sample_single_input):
    scenario: ScenarioInput = sample_single_input()
    assert core.run_optimization(scenario) is core.run_optimization(scenario)
