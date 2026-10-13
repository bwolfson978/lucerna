"""Saved-scenario storage against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a disposable database (CI has none); the
tables are created from schema.sql and dropped afterwards.
"""

import os

import pytest

from app.db import scenarios as store
from app.db import session
from app.engine.demo import DEMO_SCENARIO

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL not set")


@pytest.fixture
async def db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    await session.init_db()
    yield
    async with session.get_pool().acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS scenarios")
    await session.close_db()


async def test_save_list_get_delete(db):
    result = {"estimated_lifetime_tax_savings": 4321.0, "conversion_curve": [1, 2]}
    web_id, web_name = await store.save("user_a", DEMO_SCENARIO, result)
    chat_id, _ = await store.save(
        "user_a", DEMO_SCENARIO, result, name="From chat", scenario={"age": 63}
    )
    assert web_name == store.auto_name(DEMO_SCENARIO)

    listed = await store.list_for("user_a")
    assert [row.id for row in listed] == [chat_id, web_id]
    assert listed[0].estimated_savings == 4321.0
    assert await store.list_for("user_b") == []

    chat = await store.get("user_a", chat_id)
    assert chat.name == "From chat" and chat.scenario == {"age": 63}
    assert "conversion_curve" not in chat.result
    assert (await store.get("user_a", web_id)).scenario is None
    assert await store.get("user_b", chat_id) is None
    assert await store.get("user_a", "not-a-uuid") is None

    assert not await store.delete("user_b", chat_id)
    assert await store.delete("user_a", chat_id)
    assert await store.get("user_a", chat_id) is None


async def test_schema_upgrades_an_existing_table(db):
    # Tables created before the scenario column existed gain it on the next startup.
    async with session.get_pool().acquire() as conn:
        await conn.execute("ALTER TABLE scenarios DROP COLUMN scenario")
    await session.close_db()
    await session.init_db()
    saved_id, _ = await store.save("user_a", DEMO_SCENARIO, {}, scenario={"age": 1})
    assert (await store.get("user_a", saved_id)).scenario == {"age": 1}
