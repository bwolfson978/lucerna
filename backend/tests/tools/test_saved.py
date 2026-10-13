"""Saved scenarios, transport-neutral (app.tools.saved)."""

import pytest

from app.db.scenarios import set_store
from app.engine.types import PlanYear
from app.tools import saved
from app.tools.draft import ScenarioDraft

DRAFT = ScenarioDraft(
    age=52,
    filing_status="married_filing_jointly",
    current_income=90000,
    traditional_balance=600000,
    retirement_age=60,
)


@pytest.mark.parametrize(
    ("draft", "name"),
    [
        (DRAFT, "Married, $600K pre-tax, retire at 60"),
        (
            ScenarioDraft(filing_status="single", traditional_balance=1_250_000),
            "Single, $1.2M pre-tax",
        ),
        (ScenarioDraft(traditional_balance=2_000_000), "$2M pre-tax"),
        (ScenarioDraft(age=40), "My scenario"),
    ],
)
def test_default_names(draft, name):
    assert saved.default_name(draft) == name


def test_names_are_trimmed_and_capped():
    assert saved.clean_name("  Retire   at 60 ", DRAFT) == "Retire at 60"
    assert saved.clean_name("", DRAFT) == saved.default_name(DRAFT)
    assert len(saved.clean_name("x" * 200, DRAFT)) == saved.NAME_MAX


async def test_save_list_open_update_delete(memory_store):
    result = await saved.save("user_a", DRAFT, None)
    assert result["name"] == "Married, $600K pre-tax, retire at 60"
    assert result["complete"] is True
    assert result["traditional_balance"] == 600000

    listed = await saved.list_saved("user_a")
    assert [s["scenario_id"] for s in listed] == [result["scenario_id"]]

    row, draft = await saved.get_saved("user_a", result["scenario_id"])
    assert draft == DRAFT

    updated = await saved.update_saved("user_a", row.id, name="Plan A")
    assert updated["name"] == "Plan A"
    updated = await saved.update_saved("user_a", row.id, draft=DRAFT.model_copy(update={"age": 53}))
    assert updated["age"] == 53 and updated["name"] == "Plan A"

    await saved.delete_saved("user_a", row.id)
    assert await saved.list_saved("user_a") == []


async def test_errors_have_codes(memory_store, monkeypatch):
    with pytest.raises(saved.SavedError) as err:
        await saved.save(None, DRAFT, None)
    assert err.value.code == "sign_in_required"

    with pytest.raises(saved.SavedError) as err:
        await saved.save("user_a", ScenarioDraft(), None)
    assert err.value.code == "empty"

    with pytest.raises(saved.SavedError) as err:
        await saved.get_saved("user_a", "missing")
    assert err.value.code == "not_found"
    with pytest.raises(saved.SavedError) as err:
        await saved.delete_saved("user_a", "missing")
    assert err.value.code == "not_found"
    with pytest.raises(saved.SavedError) as err:
        await saved.update_saved("user_a", "missing", name="x")
    assert err.value.code == "not_found"

    from app.db import scenarios

    monkeypatch.setattr(scenarios, "MAX_PER_USER", 1)
    await saved.save("user_a", DRAFT, None)
    with pytest.raises(saved.SavedError) as err:
        await saved.save("user_a", DRAFT, None)
    assert err.value.code == "full"

    set_store(None)
    with pytest.raises(saved.SavedError) as err:
        await saved.list_saved("user_a")
    assert err.value.code == "unavailable"


async def test_unreadable_saved_draft(memory_store):
    row = await memory_store.create("user_a", "Broken", {"age": "very old"})
    with pytest.raises(saved.SavedError) as err:
        await saved.get_saved("user_a", row.id)
    assert err.value.code == "invalid"


def test_refreshed_draft_projects_from_this_year():
    timeline = [
        PlanYear(year=2024, gross_income=90000),
        PlanYear(year=2025, gross_income=20000, notes="Sabbatical"),
        PlanYear(year=2026, gross_income=30000, notes="Part-time"),
    ]
    old = DRAFT.model_copy(update={"age": 50, "timeline": timeline})
    fresh = saved.refreshed_draft(old, 2026)
    assert fresh.timeline[0].year == 2026
    # Changes for years still ahead are kept; past years are dropped.
    assert fresh.timeline[0].gross_income == 30000
    assert fresh.timeline[0].notes == "Part-time"
    assert all(row.year >= 2026 for row in fresh.timeline)
