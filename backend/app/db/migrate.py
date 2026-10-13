"""Apply ``backend/migrations/NNN_name.sql`` files in order, each once.

Runs at startup. An advisory lock keeps two instances starting together from
applying the same file twice; each file runs in its own transaction.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import asyncpg

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_LOCK_ID = 7_413_029  # arbitrary, constant for this app
_NAME = re.compile(r"^\d{3}_[a-z0-9_]+\.sql$")


def migration_files(directory: Path = MIGRATIONS_DIR) -> list[Path]:
    return sorted(p for p in directory.glob("*.sql") if _NAME.match(p.name))


async def apply_migrations(pool: asyncpg.Pool, directory: Path = MIGRATIONS_DIR) -> list[str]:
    """Apply pending migrations. Returns the names applied."""
    applied_now: list[str] = []
    async with pool.acquire() as conn:
        await conn.execute("SELECT pg_advisory_lock($1)", _LOCK_ID)
        try:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  name       TEXT        PRIMARY KEY,
                  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            done = {r["name"] for r in await conn.fetch("SELECT name FROM schema_migrations")}
            for path in migration_files(directory):
                if path.name in done:
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text())
                    await conn.execute(
                        "INSERT INTO schema_migrations (name) VALUES ($1)", path.name
                    )
                logger.info("Applied migration %s", path.name)
                applied_now.append(path.name)
        finally:
            await conn.execute("SELECT pg_advisory_unlock($1)", _LOCK_ID)
    return applied_now
