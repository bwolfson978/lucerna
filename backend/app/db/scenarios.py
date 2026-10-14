"""Saved scenarios: one store for the website (app/api/scenarios.py) and the MCP tools.

Every query is scoped to the owner's Clerk user id, so one user can never read or
delete another's scenarios.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.db.session import get_pool
from app.engine.types import ScenarioInput

# Fields from OptimizationResult we do NOT persist (too large / recomputed on demand).
_STRIP_FIELDS = {"conversion_curve", "reasoning_trace"}

LIST_LIMIT = 50


class StorageUnavailable(RuntimeError):
    """No database is configured."""


@dataclass(frozen=True)
class SavedSummary:
    id: str
    name: str
    created_at: datetime
    filing_status: str
    num_years: int
    estimated_savings: float
    ira_balance: float


@dataclass(frozen=True)
class SavedScenario:
    id: str
    name: str
    created_at: datetime
    inputs: ScenarioInput
    result: dict[str, Any]
    # The MCP tools' `scenario` when it was saved from a chat; None for website saves.
    scenario: dict[str, Any] | None


def auto_name(inputs: ScenarioInput) -> str:
    status_label = "Married" if inputs.filing_status == "married_filing_jointly" else "Single"
    bal = f"${inputs.traditional_ira_balance / 1_000:.0f}K"
    yrs = len(inputs.timeline)
    return f"{status_label} · {bal} IRA · {yrs} yr"


def _pool():
    pool = get_pool()
    if pool is None:
        raise StorageUnavailable("Database not available")
    return pool


def _valid_id(scenario_id: str) -> bool:
    try:
        uuid.UUID(scenario_id)
    except ValueError:
        return False
    return True


async def save(
    user_id: str,
    inputs: ScenarioInput,
    result: dict[str, Any],
    *,
    name: str | None = None,
    scenario: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Save a scenario for ``user_id``. Returns (id, name)."""
    pool = _pool()
    result_snapshot = {k: v for k, v in result.items() if k not in _STRIP_FIELDS}
    name = name or auto_name(inputs)
    scenario_id = str(uuid.uuid4())
    estimated_savings = float(result.get("estimated_lifetime_tax_savings") or 0)

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO scenarios
              (id, clerk_user_id, name, inputs, result_snapshot,
               filing_status, num_years, estimated_savings, ira_balance, scenario)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            scenario_id,
            user_id,
            name,
            inputs.model_dump(),
            result_snapshot,
            inputs.filing_status,
            len(inputs.timeline),
            estimated_savings,
            float(inputs.traditional_ira_balance),
            scenario,
        )
    return scenario_id, name


async def list_for(user_id: str) -> list[SavedSummary]:
    pool = _pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, created_at, filing_status, num_years,
                   estimated_savings, ira_balance
            FROM scenarios
            WHERE clerk_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            user_id,
            LIST_LIMIT,
        )
    return [
        SavedSummary(
            id=str(row["id"]),
            name=row["name"],
            created_at=row["created_at"],
            filing_status=row["filing_status"],
            num_years=row["num_years"],
            estimated_savings=float(row["estimated_savings"]),
            ira_balance=float(row["ira_balance"]),
        )
        for row in rows
    ]


async def get(user_id: str, scenario_id: str) -> SavedScenario | None:
    pool = _pool()
    if not _valid_id(scenario_id):
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, name, created_at, inputs, result_snapshot, scenario
            FROM scenarios
            WHERE id = $1 AND clerk_user_id = $2
            """,
            scenario_id,
            user_id,
        )
    if row is None:
        return None
    return SavedScenario(
        id=str(row["id"]),
        name=row["name"],
        created_at=row["created_at"],
        inputs=ScenarioInput.model_validate(row["inputs"]),
        result=row["result_snapshot"],
        scenario=row["scenario"],
    )


async def delete(user_id: str, scenario_id: str) -> bool:
    """True when a scenario was deleted."""
    pool = _pool()
    if not _valid_id(scenario_id):
        return False
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM scenarios WHERE id = $1 AND clerk_user_id = $2",
            scenario_id,
            user_id,
        )
    # asyncpg returns "DELETE N"
    return result != "DELETE 0"


async def delete_all(user_id: str) -> int:
    """Delete every scenario the user saved (account deletion). Returns how many."""
    pool = _pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM scenarios WHERE clerk_user_id = $1", user_id)
    return int(result.rsplit(" ", 1)[-1])


async def count_all(user_id: str) -> int:
    """How many scenarios a user has saved (for a dry run before ``delete_all``)."""
    pool = _pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT count(*) FROM scenarios WHERE clerk_user_id = $1", user_id
        )
