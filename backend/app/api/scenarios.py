"""Scenario persistence — save, update, list, fetch, and delete user scenarios."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import get_current_user
from app.db import scenarios as store
from app.engine.types import ScenarioInput
from app.tools import core
from app.tools.draft import ScenarioDraft, current_year
from app.tools.models import ScenarioUpdate

router = APIRouter()


# ── Request / response models ──────────────────────────────────────────────────


class SaveScenarioRequest(BaseModel):
    input: ScenarioInput
    result: dict[str, Any]
    # The form's draft, kept so the scenario reopens exactly (here and in a chat).
    draft: ScenarioDraft | None = None

    def chat_scenario(self) -> dict[str, Any] | None:
        return core.scenario_from_draft(self.draft, current_year()) if self.draft else None


class ScenarioSummary(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    filing_status: str
    num_years: int
    estimated_savings: float
    ira_balance: float


class ScenarioDetail(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    inputs: ScenarioInput
    result: dict[str, Any]
    # The scenario as the form's draft, to keep working on it. Rebuilt from the engine
    # inputs (approximately) for scenarios saved before drafts were kept.
    draft: dict[str, Any] | None


class SaveResponse(BaseModel):
    id: str
    name: str


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Database not available",
    )


def _draft(saved: store.SavedScenario) -> dict[str, Any] | None:
    year = current_year()
    try:
        scenario = saved.scenario or core.scenario_from_input(saved.inputs, year)
        update = ScenarioUpdate.model_validate(scenario)
        return core.draft_from_scenario(update, year).model_dump(mode="json")
    except (ValueError, core.ToolError):
        return None


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("/scenarios", response_model=SaveResponse, status_code=status.HTTP_201_CREATED)
async def save_scenario(
    body: SaveScenarioRequest,
    user_id: str = Depends(get_current_user),
) -> SaveResponse:
    try:
        scenario_id, name = await store.save(
            user_id, body.input, body.result, scenario=body.chat_scenario()
        )
    except store.StorageUnavailable as err:
        raise _unavailable() from err
    return SaveResponse(id=scenario_id, name=name)


@router.put("/scenarios/{scenario_id}", response_model=SaveResponse)
async def update_scenario(
    scenario_id: str,
    body: SaveScenarioRequest,
    user_id: str = Depends(get_current_user),
) -> SaveResponse:
    """Overwrite a saved scenario with its latest inputs and result (the person kept
    working on it). Creating a new one is a POST."""
    try:
        saved = await store.update(
            user_id, scenario_id, body.input, body.result, scenario=body.chat_scenario()
        )
    except store.StorageUnavailable as err:
        raise _unavailable() from err
    if saved is None:
        raise _not_found()
    return SaveResponse(id=saved[0], name=saved[1])


@router.get("/scenarios", response_model=list[ScenarioSummary])
async def list_scenarios(
    user_id: str = Depends(get_current_user),
) -> list[ScenarioSummary]:
    try:
        rows = await store.list_for(user_id)
    except store.StorageUnavailable as err:
        raise _unavailable() from err
    return [
        ScenarioSummary(
            id=row.id,
            name=row.name,
            created_at=row.created_at.isoformat(),
            updated_at=row.updated_at.isoformat(),
            filing_status=row.filing_status,
            num_years=row.num_years,
            estimated_savings=row.estimated_savings,
            ira_balance=row.ira_balance,
        )
        for row in rows
    ]


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetail)
async def get_scenario(
    scenario_id: str,
    user_id: str = Depends(get_current_user),
) -> ScenarioDetail:
    try:
        saved = await store.get(user_id, scenario_id)
    except store.StorageUnavailable as err:
        raise _unavailable() from err
    if saved is None:
        raise _not_found()
    return ScenarioDetail(
        id=saved.id,
        name=saved.name,
        created_at=saved.created_at.isoformat(),
        updated_at=saved.updated_at.isoformat(),
        inputs=saved.inputs,
        result=saved.result,
        draft=_draft(saved),
    )


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: str,
    user_id: str = Depends(get_current_user),
) -> None:
    try:
        deleted = await store.delete(user_id, scenario_id)
    except store.StorageUnavailable as err:
        raise _unavailable() from err
    if not deleted:
        raise _not_found()
