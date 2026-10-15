"""asyncpg connection pool — initialised in the FastAPI lifespan."""

import json
from pathlib import Path

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None

_SCHEMA = Path(__file__).with_name("schema.sql")


async def init_db() -> None:
    global _pool
    database_url = settings().database_url
    if not database_url:
        return  # no DB configured; scenario endpoints will return 503

    async def _init_conn(conn: asyncpg.Connection) -> None:
        # Teach asyncpg to encode/decode JSONB columns as dicts automatically.
        await conn.set_type_codec(
            "jsonb",
            encoder=json.dumps,
            decoder=json.loads,
            schema="pg_catalog",
        )

    _pool = await asyncpg.create_pool(
        database_url,
        min_size=2,
        max_size=10,
        init=_init_conn,
    )
    async with _pool.acquire() as conn:
        await conn.execute(_SCHEMA.read_text())


async def close_db() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool | None:
    return _pool
