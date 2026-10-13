"""Scenario draft rules: timeline generation, merging, readiness and the engine input."""

import json
from pathlib import Path

import pytest

from app.engine.types import PlanYear
from app.tools.draft import (
    ScenarioDraft,
    build_scenario_input,
    draft_hash,
    generate_timeline,
    merge_timeline,
    missing_fields,
    sync_timeline,
    validation_errors,
)

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures" / "scenario-draft-cases.json"


def complete(**overrides) -> ScenarioDraft:
    values = dict(
        age=45,
        filing_status="single",
        current_income=85000,
        traditional_balance=250000,
        retirement_age=65,
    )
    values.update(overrides)
    draft = ScenarioDraft(**values)
    sync_timeline(draft, None, 2026)
    return draft


def test_timeline_runs_until_retirement_with_growth():
    rows = generate_timeline(45, 48, 100000, 3, 2026)
    assert [r.year for r in rows] == [2026, 2027, 2028]
    assert [r.gross_income for r in rows] == [100000, 103000, 106090]


def test_retired_timeline_runs_to_73_capped_at_ten_years():
    assert len(generate_timeline(66, 60, 30000, 0, 2026)) == 7
    assert len(generate_timeline(55, 50, 30000, 0, 2026)) == 10
    assert len(generate_timeline(80, 60, 30000, 0, 2026)) == 1


def test_merge_keeps_rows_with_notes_or_state():
    fresh = generate_timeline(45, 48, 100000, 0, 2026)
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
        "age",
        "filing_status",
        "current_income",
        "traditional_balance",
        "retirement_age",
    ]
    with pytest.raises(ValueError, match="missing age"):
        build_scenario_input(ScenarioDraft())


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
    assert draft_hash(complete()) != draft_hash(complete(age=46))


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


def test_build_passes_retirement_income():
    assert build_scenario_input(complete(retirement_income=36_000)).retirement_income == 36_000
    assert build_scenario_input(complete()).retirement_income == 0
