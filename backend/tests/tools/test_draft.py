"""Scenario draft rules: timeline generation, merging, readiness and the engine input."""

import json
from pathlib import Path

import pytest

from app.engine.types import PlanYear
from app.tools.draft import (
    IncomeSource,
    ScenarioDraft,
    build_scenario_input,
    draft_hash,
    generate_timeline,
    merge_timeline,
    missing_fields,
    source_label,
    sync_timeline,
    validation_errors,
)

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "scenario-draft-cases.json"


def complete(**overrides) -> ScenarioDraft:
    values = dict(
        birth_year=1981,
        birth_month=6,
        filing_status="single",
        current_income=85000,
        traditional_balance=250000,
        retirement_age=65,
    )
    values.update(overrides)
    draft = ScenarioDraft(**values)
    sync_timeline(draft, None, 2026)
    return draft


def test_timeline_runs_through_the_plan_with_income_until_retirement():
    rows = generate_timeline(45, 48, 100000, 3, 2026, planning_horizon_age=50)
    assert [r.year for r in rows] == [2026, 2027, 2028, 2029, 2030, 2031]
    assert [r.gross_income for r in rows] == [100000, 103000, 106090, 0, 0, 0]


def test_retired_timeline_keeps_income_for_life():
    rows = generate_timeline(66, 60, 30000, 0, 2026, planning_horizon_age=90)
    assert len(rows) == 25
    assert {r.gross_income for r in rows} == {30000}
    assert len(generate_timeline(95, 60, 30000, 0, 2026, planning_horizon_age=90)) == 1


def test_sources_add_to_income_over_their_age_range():
    sources = [
        IncomeSource(kind="social_security", amount=40000, start_age=67),
        IncomeSource(kind="pension", owner="spouse", amount=10000, start_age=65, end_age=66),
    ]
    rows = generate_timeline(63, 73, 20000, 0, 2026, 70, sources, base_end_age=64)
    assert [r.gross_income for r in rows] == [
        20000,
        20000,
        10000,
        10000,
        40000,
        40000,
        40000,
        40000,
    ]


def test_source_without_end_age_runs_to_plan_end():
    sources = [IncomeSource(kind="other", label="Rental", amount=12000, start_age=50)]
    rows = generate_timeline(48, 50, 50000, 0, 2026, 52, sources)
    assert [r.gross_income for r in rows] == [50000, 50000, 12000, 12000, 12000]


def test_source_ending_before_it_starts_is_an_error():
    draft = complete(
        income_sources=[IncomeSource(kind="pension", amount=1000, start_age=70, end_age=65)]
    )
    assert validation_errors(draft) == ["income source 'Pension' ends before it starts"]


def test_source_label_names_spouse():
    src = IncomeSource(kind="social_security", owner="spouse", amount=1, start_age=67)
    assert source_label(src) == "Social Security (spouse)"


def test_merge_keeps_rows_with_notes_or_state():
    fresh = generate_timeline(45, 48, 100000, 0, 2026, planning_horizon_age=47)
    existing = [
        PlanYear(year=2026, gross_income=1),
        PlanYear(year=2027, gross_income=2, notes="Sabbatical"),
        PlanYear(year=2028, gross_income=3, state="TX"),
    ]
    merged = merge_timeline(fresh, existing)
    assert [r.gross_income for r in merged] == [100000, 2, 3]


def test_sync_only_regenerates_when_base_inputs_change():
    draft = complete()
    draft.timeline[0] = PlanYear(year=2026, gross_income=1)  # edited without a note
    previous = draft.model_copy(deep=True)
    draft.traditional_balance = 300000
    sync_timeline(draft, previous, 2026)
    assert draft.timeline[0].gross_income == 1

    draft.current_income = 90000
    sync_timeline(draft, previous, 2026)
    assert draft.timeline[0].gross_income == 90000


def test_sync_clears_timeline_when_inputs_missing():
    draft = complete()
    previous = draft.model_copy(deep=True)
    draft.retirement_age = None
    sync_timeline(draft, previous, 2026)
    assert draft.timeline == []


def test_missing_fields_and_build_errors():
    assert missing_fields(ScenarioDraft()) == [
        "birth_year",
        "birth_month",
        "filing_status",
        "current_income",
        "traditional_balance",
        "retirement_age",
    ]
    with pytest.raises(ValueError, match="missing birth_year"):
        build_scenario_input(ScenarioDraft())


def test_joint_filers_need_the_spouse_birth_date():
    draft = complete(filing_status="married_filing_jointly")
    assert missing_fields(draft) == ["spouse_birth_year", "spouse_birth_month"]
    draft = complete(
        filing_status="married_filing_jointly", spouse_birth_year=1984, spouse_birth_month=11
    )
    assert missing_fields(draft) == []
    scenario = build_scenario_input(draft)
    assert (scenario.age, scenario.spouse_age) == (45, 42)


def test_age_is_the_age_turned_in_the_first_year():
    draft = complete(birth_year=1960, birth_month=12)
    assert draft.age == 66
    assert build_scenario_input(draft).age == 66


def test_a_birth_year_after_the_plan_starts_is_an_error():
    draft = complete(birth_year=2030)
    assert "birth_year 2030 is after 2026" in validation_errors(draft)


def test_a_draft_saved_with_only_an_age_gets_a_birth_year():
    """Drafts from before birth dates were asked for: the age was the first year's."""
    legacy = ScenarioDraft.model_validate(
        {"age": 66, "timeline": [{"year": 2026, "gross_income": 0}]}
    )
    assert (legacy.birth_year, legacy.birth_month) == (1960, None)
    assert "birth_month" in missing_fields(legacy)


def test_invalid_state_is_reported():
    draft = complete(state="ZZ")
    assert validation_errors(draft) == ["state 'ZZ' is not a supported state code"]


def test_build_maps_form_semantics():
    draft = complete(
        state="CA",
        retirement_state="CA",
        retirement_spending=0,
        roth_balance=None,
        investment_return_pct=6,
    )
    scenario = build_scenario_input(draft)
    assert scenario.retirement_state is None
    assert scenario.default_drawdown is None
    assert scenario.roth_ira_balance == 0
    assert scenario.annual_growth_rate == pytest.approx(0.06)
    assert scenario.drawdown_start_age == 65


def test_draft_hash_changes_with_values():
    assert draft_hash(complete()) == draft_hash(complete())
    assert draft_hash(complete()) != draft_hash(complete(birth_year=1980))


def test_shared_parity_fixture_matches_reference():
    """The fixture the frontend tests against must reflect the current Python rules."""
    data = json.loads(FIXTURES.read_text())
    for case in data["build"]:
        draft = ScenarioDraft(**case["draft"])
        sync_timeline(draft, None, case["start_year"])
        scenario = build_scenario_input(draft).model_dump(mode="json", exclude_none=True)
        assert scenario == case["scenario"], case["name"]
    for case in data["missing"]:
        assert missing_fields(ScenarioDraft(**case["draft"])) == case["missing"], case["name"]
