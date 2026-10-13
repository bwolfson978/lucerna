"""Saved scenarios, transport-neutral: the MCP tools and the web app's REST routes both
call these. A saved scenario is a name plus the scenario draft (the calculator
form's values); results are recomputed when it's opened.
"""

from __future__ import annotations

import datetime
from typing import Any

from pydantic import ValidationError

from app.db.scenarios import SavedScenario, StoreFull, get_store
from app.engine.types import FilingStatus
from app.tools import core
from app.tools.draft import REQUIRED_FIELDS, ScenarioDraft
from app.tools.models import ScenarioUpdate

NAME_MAX = 80


class SavedError(core.ToolError):
    """A save/list/open that can't go ahead. ``code`` tells clients what to show."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _store():
    store = get_store()
    if store is None:
        raise SavedError("unavailable", "Saving scenarios isn't available right now.")
    return store


def _require(user_id: str | None) -> str:
    if not user_id:
        raise SavedError("sign_in_required", "Sign in to save scenarios and see saved ones.")
    return user_id


def _money(value: float) -> str:
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M".replace(".0M", "M")
    return f"${value / 1_000:.0f}K"


def default_name(draft: ScenarioDraft) -> str:
    """A readable name from the scenario, e.g. "Married, $600K pre-tax, retire at 60"."""
    parts = []
    if draft.filing_status is not None:
        parts.append("Married" if draft.filing_status == FilingStatus.MFJ else "Single")
    if draft.traditional_balance:
        parts.append(f"{_money(draft.traditional_balance)} pre-tax")
    if draft.retirement_age is not None:
        parts.append(f"retire at {draft.retirement_age}")
    return ", ".join(parts) or "My scenario"


def clean_name(name: str | None, draft: ScenarioDraft) -> str:
    cleaned = " ".join((name or "").split())[:NAME_MAX]
    return cleaned or default_name(draft)


def _has_values(draft: ScenarioDraft) -> bool:
    return any(getattr(draft, field) is not None for field in REQUIRED_FIELDS)


def _draft(row: SavedScenario) -> ScenarioDraft:
    try:
        return ScenarioDraft.model_validate(row.draft)
    except ValidationError as err:
        raise SavedError("invalid", "This saved scenario can't be read.") from err


def summary(row: SavedScenario) -> dict[str, Any]:
    """What a list shows: the name, when it was saved, and the headline inputs."""
    draft = _draft(row)
    return {
        "scenario_id": row.id,
        "name": row.name,
        "saved_at": row.updated_at.isoformat(),
        "age": draft.age,
        "filing_status": draft.filing_status.value if draft.filing_status else None,
        "traditional_balance": draft.traditional_balance,
        "retirement_age": draft.retirement_age,
        "state": draft.state,
        "complete": not core.describe_draft(draft, draft_year(draft))["missing_required"],
    }


def draft_year(draft: ScenarioDraft) -> int:
    """The year a saved draft's timeline starts (its first row), or this year."""
    return draft.timeline[0].year if draft.timeline else datetime.date.today().year


def refreshed_draft(draft: ScenarioDraft, start_year: int) -> ScenarioDraft:
    """A saved draft rebuilt for ``start_year``: the timeline is projected again from
    this year, keeping the user's changes for years still ahead."""
    scenario = core.scenario_from_draft(draft, draft_year(draft))
    changes = [c for c in scenario.get("income_changes", []) if c["year"] >= start_year]
    scenario["income_changes"] = changes or None
    try:
        return core.draft_from_scenario(ScenarioUpdate.model_validate(scenario), start_year)
    except (ValidationError, core.ToolError):
        scenario["income_changes"] = None
        return core.draft_from_scenario(ScenarioUpdate.model_validate(scenario), start_year)


async def save(user_id: str | None, draft: ScenarioDraft, name: str | None) -> dict[str, Any]:
    user_id = _require(user_id)
    if not _has_values(draft):
        raise SavedError("empty", "There's nothing in this scenario to save yet.")
    try:
        row = await _store().create(user_id, clean_name(name, draft), draft.model_dump(mode="json"))
    except StoreFull as err:
        raise SavedError(
            "full", "You've reached the limit of saved scenarios. Delete one to save another."
        ) from err
    return summary(row)


async def list_saved(user_id: str | None) -> list[dict[str, Any]]:
    user_id = _require(user_id)
    return [summary(row) for row in await _store().list(user_id)]


async def get_saved(user_id: str | None, scenario_id: str) -> tuple[SavedScenario, ScenarioDraft]:
    user_id = _require(user_id)
    row = await _store().get(user_id, scenario_id)
    if row is None:
        raise SavedError("not_found", "That saved scenario wasn't found.")
    return row, _draft(row)


async def update_saved(
    user_id: str | None,
    scenario_id: str,
    *,
    name: str | None = None,
    draft: ScenarioDraft | None = None,
) -> dict[str, Any]:
    user_id = _require(user_id)
    _row, current_draft = await get_saved(user_id, scenario_id)
    new_draft = draft if draft is not None else current_draft
    if draft is not None and not _has_values(draft):
        raise SavedError("empty", "There's nothing in this scenario to save yet.")
    row = await _store().update(
        user_id,
        scenario_id,
        name=clean_name(name, new_draft) if name is not None else None,
        draft=draft.model_dump(mode="json") if draft is not None else None,
    )
    if row is None:
        raise SavedError("not_found", "That saved scenario wasn't found.")
    return summary(row)


async def delete_saved(user_id: str | None, scenario_id: str) -> None:
    user_id = _require(user_id)
    if not await _store().delete(user_id, scenario_id):
        raise SavedError("not_found", "That saved scenario wasn't found.")
