"""Scenario persistence — save, list, fetch, and delete user scenarios."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import get_current_user
from app.db.session import get_pool
from app.engine.types import ScenarioInput

router = APIRouter()

# Fields from OptimizationResult we do NOT persist (too large / recomputed on demand).
_STRIP_FIELDS = {"conversion_curve", "reasoning_trace"}


def _auto_name(inputs: ScenarioInput) -> str:
    status_label = (
        "Married" if inputs.filing_status == "married_filing_jointly" else "Single"
    )
    bal = f"${inputs.traditional_ira_balance / 1_000:.0f}K"
    yrs = len(inputs.timeline)
    return f"{status_label} · {bal} IRA · {yrs} yr"


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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_pool():
    pool = get_pool()
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not available",
        )
    return pool


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/scenarios", response_model=SaveResponse, status_code=status.HTTP_201_CREATED)
async def save_scenario(
    body: SaveScenarioRequest,
    user_id: str = Depends(get_current_user),
) -> SaveResponse:
    pool = _require_pool()

    result_snapshot = {k: v for k, v in body.result.items() if k not in _STRIP_FIELDS}
    name = _auto_name(body.input)
    scenario_id = str(uuid.uuid4())
    estimated_savings = float(body.result.get("estimated_lifetime_tax_savings") or 0)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO scenarios
              (id, clerk_user_id, name, inputs, result_snapshot,
               filing_status, num_years, estimated_savings, ira_balance)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            scenario_id,
            user_id,
            name,
            body.input.model_dump(),
            result_snapshot,
            body.input.filing_status,
            len(body.input.timeline),
            estimated_savings,
            float(body.input.traditional_ira_balance),
        )

    return SaveResponse(id=scenario_id, name=name)


@router.get("/scenarios", response_model=list[ScenarioSummary])
async def list_scenarios(
    user_id: str = Depends(get_current_user),
) -> list[ScenarioSummary]:
    pool = _require_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, created_at, filing_status, num_years,
                   estimated_savings, ira_balance
            FROM scenarios
            WHERE clerk_user_id = $1
            ORDER BY created_at DESC
            LIMIT 50
            """,
            user_id,
        )

    return [
        ScenarioSummary(
            id=str(row["id"]),
            name=row["name"],
            created_at=row["created_at"].isoformat(),
            filing_status=row["filing_status"],
            num_years=row["num_years"],
            estimated_savings=float(row["estimated_savings"]),
            ira_balance=float(row["ira_balance"]),
        )
        for row in rows
    ]


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetail)
async def get_scenario(
    scenario_id: str,
    user_id: str = Depends(get_current_user),
) -> ScenarioDetail:
    pool = _require_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, created_at, inputs, result_snapshot
            FROM scenarios
            WHERE id = $1 AND clerk_user_id = $2
            """,
            scenario_id,
            user_id,
        )

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    return ScenarioDetail(
        id=str(row["id"]),
        name=row["name"],
        created_at=row["created_at"].isoformat(),
        inputs=ScenarioInput.model_validate(row["inputs"]),
        result=row["result_snapshot"],
    )


@router.delete("/scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: str,
    user_id: str = Depends(get_current_user),
) -> None:
    pool = _require_pool()

    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM scenarios WHERE id = $1 AND clerk_user_id = $2",
            scenario_id,
            user_id,
        )

    # asyncpg returns "DELETE N" — check N > 0
    if result == "DELETE 0":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
