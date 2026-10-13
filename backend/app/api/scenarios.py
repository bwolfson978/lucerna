"""Scenario persistence — save, list, fetch, and delete user scenarios."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import get_current_user
from app.db import scenarios as store
from app.engine.types import ScenarioInput

router = APIRouter()


# ── Request / response models ──────────────────────────────────────────────────


class SaveScenarioRequest(BaseModel):
    input: ScenarioInput
    result: dict[str, Any]


class ScenarioSummary(BaseModel):
    id: str
    name: str
    created_at: str
    filing_status: str
    num_years: int
    estimated_savings: float
    ira_balance: float


class ScenarioDetail(BaseModel):
    id: str
    name: str
    created_at: str
    inputs: ScenarioInput
    result: dict[str, Any]


class SaveResponse(BaseModel):
    id: str
    name: str


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Database not available",
    )


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.post("/scenarios", response_model=SaveResponse, status_code=status.HTTP_201_CREATED)
async def save_scenario(
    body: SaveScenarioRequest,
    user_id: str = Depends(get_current_user),
) -> SaveResponse:
    try:
        scenario_id, name = await store.save(user_id, body.input, body.result)
    except store.StorageUnavailable as err:
        raise _unavailable() from err
    return SaveResponse(id=scenario_id, name=name)


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
        inputs=saved.inputs,
        result=saved.result,
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
