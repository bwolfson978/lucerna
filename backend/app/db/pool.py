"""Postgres connection pool, opened in the app lifespan when ``DATABASE_URL`` is set.

Without a database the app runs as before; saving scenarios reports that it's
unavailable.
"""

from __future__ import annotations

import json
import logging
import os

import asyncpg

from app.db.migrate import apply_migrations

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    # JSONB columns as Python dicts.
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


async def create_pool(database_url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        database_url, min_size=1, max_size=5, init=_init_connection, command_timeout=10
    )


async def open_db() -> None:
    """Connect and bring the schema up to date. Logs and carries on if the database
    is unreachable, so an outage only takes down saving."""
    global _pool
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url or _pool is not None:
        return
    try:
        pool = await create_pool(database_url)
        await apply_migrations(pool)
    except (OSError, asyncpg.PostgresError) as err:
        logger.error("Database unavailable, saved scenarios are off: %s", err)
        return
    _pool = pool


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool | None:
    return _pool
