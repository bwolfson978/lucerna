"""Saved scenarios: storage only. Validation and naming live in ``app.tools.saved``.

``get_store()`` picks Postgres when the pool is open. ``SAVED_SCENARIOS_STORE=memory``
uses process memory instead (local development without a database); tests install
a store with ``set_store``.
"""

from __future__ import annotations

import datetime
import os
import threading
import uuid
from dataclasses import dataclass, replace
from typing import Any, Protocol

from app.db.pool import get_pool

MAX_PER_USER = 100


@dataclass(frozen=True)
class SavedScenario:
    id: str
    name: str
    draft: dict[str, Any]
    created_at: datetime.datetime
    updated_at: datetime.datetime


class StoreFull(Exception):
    """The user already has MAX_PER_USER saved scenarios."""


class ScenarioStore(Protocol):
    async def create(self, user_id: str, name: str, draft: dict[str, Any]) -> SavedScenario: ...

    async def list(self, user_id: str) -> list[SavedScenario]: ...

    async def get(self, user_id: str, scenario_id: str) -> SavedScenario | None: ...

    async def update(
        self,
        user_id: str,
        scenario_id: str,
        *,
        name: str | None = None,
        draft: dict[str, Any] | None = None,
    ) -> SavedScenario | None: ...

    async def delete(self, user_id: str, scenario_id: str) -> bool: ...


def _uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError, AttributeError):
        return None


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


class MemoryStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._rows: dict[str, tuple[str, SavedScenario]] = {}

    async def create(self, user_id: str, name: str, draft: dict[str, Any]) -> SavedScenario:
        with self._lock:
            if sum(1 for owner, _ in self._rows.values() if owner == user_id) >= MAX_PER_USER:
                raise StoreFull
            now = _now()
            row = SavedScenario(str(uuid.uuid4()), name, draft, now, now)
            self._rows[row.id] = (user_id, row)
            return row

    async def list(self, user_id: str) -> list[SavedScenario]:
        with self._lock:
            rows = [row for owner, row in self._rows.values() if owner == user_id]
        return sorted(rows, key=lambda r: r.updated_at, reverse=True)

    async def get(self, user_id: str, scenario_id: str) -> SavedScenario | None:
        with self._lock:
            owner, row = self._rows.get(scenario_id, (None, None))
        return row if owner == user_id else None

    async def update(self, user_id, scenario_id, *, name=None, draft=None):
        with self._lock:
            owner, row = self._rows.get(scenario_id, (None, None))
            if owner != user_id or row is None:
                return None
            row = replace(
                row,
                name=name if name is not None else row.name,
                draft=draft if draft is not None else row.draft,
                updated_at=_now(),
            )
            self._rows[scenario_id] = (user_id, row)
            return row

    async def delete(self, user_id: str, scenario_id: str) -> bool:
        with self._lock:
            owner, _ = self._rows.get(scenario_id, (None, None))
            if owner != user_id:
                return False
            del self._rows[scenario_id]
            return True


def _row(record) -> SavedScenario:
    return SavedScenario(
        id=str(record["id"]),
        name=record["name"],
        draft=record["draft"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


_COLUMNS = "id, name, draft, created_at, updated_at"


class PostgresStore:
    def __init__(self, pool) -> None:
        self._pool = pool

    async def create(self, user_id: str, name: str, draft: dict[str, Any]) -> SavedScenario:
        async with self._pool.acquire() as conn, conn.transaction():
            # Serialize creates per user so two at once can't both pass the cap.
            await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", user_id)
            count = await conn.fetchval(
                "SELECT count(*) FROM saved_scenarios WHERE user_id = $1", user_id
            )
            if count >= MAX_PER_USER:
                raise StoreFull
            record = await conn.fetchrow(
                f"INSERT INTO saved_scenarios (user_id, name, draft) VALUES ($1, $2, $3) "
                f"RETURNING {_COLUMNS}",
                user_id,
                name,
                draft,
            )
        return _row(record)

    async def list(self, user_id: str) -> list[SavedScenario]:
        async with self._pool.acquire() as conn:
            records = await conn.fetch(
                f"SELECT {_COLUMNS} FROM saved_scenarios WHERE user_id = $1 "
                "ORDER BY updated_at DESC LIMIT $2",
                user_id,
                MAX_PER_USER,
            )
        return [_row(r) for r in records]

    async def get(self, user_id: str, scenario_id: str) -> SavedScenario | None:
        key = _uuid(scenario_id)
        if key is None:
            return None
        async with self._pool.acquire() as conn:
            record = await conn.fetchrow(
                f"SELECT {_COLUMNS} FROM saved_scenarios WHERE id = $1 AND user_id = $2",
                key,
                user_id,
            )
        return _row(record) if record else None

    async def update(self, user_id, scenario_id, *, name=None, draft=None):
        key = _uuid(scenario_id)
        if key is None:
            return None
        async with self._pool.acquire() as conn:
            record = await conn.fetchrow(
                "UPDATE saved_scenarios SET name = COALESCE($3, name), "
                "draft = COALESCE($4, draft), updated_at = now() "
                f"WHERE id = $1 AND user_id = $2 RETURNING {_COLUMNS}",
                key,
                user_id,
                name,
                draft,
            )
        return _row(record) if record else None

    async def delete(self, user_id: str, scenario_id: str) -> bool:
        key = _uuid(scenario_id)
        if key is None:
            return False
        async with self._pool.acquire() as conn:
            status = await conn.execute(
                "DELETE FROM saved_scenarios WHERE id = $1 AND user_id = $2", key, user_id
            )
        return status == "DELETE 1"


_override: ScenarioStore | None = None
_memory: MemoryStore | None = None


def set_store(store: ScenarioStore | None) -> None:
    """Use ``store`` instead of the configured one (tests). None restores the default."""
    global _override
    _override = store


def get_store() -> ScenarioStore | None:
    """The store to use, or None when saving is unavailable."""
    global _memory
    if _override is not None:
        return _override
    pool = get_pool()
    if pool is not None:
        return PostgresStore(pool)
    if os.environ.get("SAVED_SCENARIOS_STORE") == "memory":
        if _memory is None:
            _memory = MemoryStore()
        return _memory
    return None
