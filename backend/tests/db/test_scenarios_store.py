"""Saved scenario storage, in memory and (when TEST_DATABASE_URL is set) in Postgres."""

import os
import uuid

import pytest

from app.db import scenarios as store_module
from app.db.migrate import apply_migrations, migration_files
from app.db.pool import create_pool
from app.db.scenarios import MemoryStore, PostgresStore, StoreFull

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
needs_postgres = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL not set")

DRAFT = {"age": 52, "filing_status": "single", "timeline": []}


async def _fresh_pool():
    pool = await create_pool(DATABASE_URL)
    async with pool.acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS saved_scenarios, schema_migrations")
    await apply_migrations(pool)
    return pool


@pytest.fixture
async def pg_pool():
    pool = await _fresh_pool()
    yield pool
    await pool.close()


@pytest.fixture(params=["memory", pytest.param("postgres", marks=needs_postgres)])
async def store(request):
    if request.param == "memory":
        yield MemoryStore()
        return
    pool = await _fresh_pool()
    yield PostgresStore(pool)
    await pool.close()


async def test_create_list_get_update_delete(store):
    first = await store.create("user_a", "First", DRAFT)
    second = await store.create("user_a", "Second", {**DRAFT, "age": 60})
    await store.create("user_b", "Someone else's", DRAFT)

    listed = await store.list("user_a")
    assert [s.name for s in listed] == ["Second", "First"]  # newest first
    assert (await store.get("user_a", first.id)).draft == DRAFT

    renamed = await store.update("user_a", first.id, name="Renamed")
    assert renamed.name == "Renamed" and renamed.draft == DRAFT
    assert renamed.updated_at >= first.updated_at
    redrafted = await store.update("user_a", first.id, draft={**DRAFT, "age": 55})
    assert redrafted.name == "Renamed" and redrafted.draft["age"] == 55
    assert [s.id for s in await store.list("user_a")][0] == first.id  # most recently saved

    assert await store.delete("user_a", second.id)
    assert not await store.delete("user_a", second.id)
    assert [s.id for s in await store.list("user_a")] == [first.id]


async def test_users_only_see_their_own(store):
    mine = await store.create("user_a", "Mine", DRAFT)
    assert await store.get("user_b", mine.id) is None
    assert await store.update("user_b", mine.id, name="Taken") is None
    assert not await store.delete("user_b", mine.id)
    assert (await store.get("user_a", mine.id)).name == "Mine"


@pytest.mark.parametrize("bad_id", ["", "not-a-uuid", str(uuid.uuid4())])
async def test_unknown_ids(store, bad_id):
    assert await store.get("user_a", bad_id) is None
    assert await store.update("user_a", bad_id, name="x") is None
    assert not await store.delete("user_a", bad_id)


async def test_per_user_cap(store, monkeypatch):
    monkeypatch.setattr(store_module, "MAX_PER_USER", 2)
    await store.create("user_a", "One", DRAFT)
    await store.create("user_a", "Two", DRAFT)
    with pytest.raises(StoreFull):
        await store.create("user_a", "Three", DRAFT)
    await store.create("user_b", "Other user", DRAFT)


@needs_postgres
async def test_migrations_apply_once(pg_pool):
    assert await apply_migrations(pg_pool) == []
    async with pg_pool.acquire() as conn:
        names = [r["name"] for r in await conn.fetch("SELECT name FROM schema_migrations")]
    assert names == [p.name for p in migration_files()]


def test_migration_files_are_numbered():
    names = [p.name for p in migration_files()]
    assert names and names == sorted(names)
    assert names[0] == "001_saved_scenarios.sql"


def test_store_selection(monkeypatch):
    monkeypatch.setattr(store_module, "_memory", None)
    monkeypatch.delenv("SAVED_SCENARIOS_STORE", raising=False)
    assert store_module.get_store() is None  # no database: saving is unavailable
    monkeypatch.setenv("SAVED_SCENARIOS_STORE", "memory")
    store = store_module.get_store()
    assert isinstance(store, MemoryStore) and store_module.get_store() is store
    override = MemoryStore()
    store_module.set_store(override)
    try:
        assert store_module.get_store() is override
    finally:
        store_module.set_store(None)


async def test_open_db_without_a_database_is_a_no_op(monkeypatch):
    from app.db import pool

    monkeypatch.delenv("DATABASE_URL", raising=False)
    await pool.open_db()
    assert pool.get_pool() is None


async def test_open_db_carries_on_when_unreachable(monkeypatch, caplog):
    from app.db import pool

    monkeypatch.setenv("DATABASE_URL", "postgresql://nobody@127.0.0.1:1/none")
    await pool.open_db()
    assert pool.get_pool() is None
    assert "saved scenarios are off" in caplog.text


@needs_postgres
async def test_open_db_connects_and_migrates(monkeypatch):
    from app.db import pool

    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    await pool.open_db()
    try:
        assert pool.get_pool() is not None
        assert isinstance(store_module.get_store(), PostgresStore)
    finally:
        await pool.close_db()
    assert pool.get_pool() is None
