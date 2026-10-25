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


async def test_delete_all_removes_only_that_users_scenarios(db):
    result = {"estimated_lifetime_tax_savings": 1.0}
    await store.save("user_a", DEMO_SCENARIO, result)
    await store.save("user_a", DEMO_SCENARIO, result)
    kept, _ = await store.save("user_b", DEMO_SCENARIO, result)

    assert await store.count_all("user_a") == 2
    assert await store.delete_all("user_a") == 2
    assert await store.count_all("user_a") == 0
    assert await store.list_for("user_a") == []
    assert [row.id for row in await store.list_for("user_b")] == [kept]
    assert await store.delete_all("user_a") == 0


async def test_schema_upgrades_an_existing_table(db):
    # Tables created before the scenario column existed gain it on the next startup.
    async with session.get_pool().acquire() as conn:
        await conn.execute("ALTER TABLE scenarios DROP COLUMN scenario")
    await session.close_db()
    await session.init_db()
    saved_id, _ = await store.save("user_a", DEMO_SCENARIO, {}, scenario={"age": 1})
    assert (await store.get("user_a", saved_id)).scenario == {"age": 1}


async def test_update_overwrites_the_users_scenario_in_place(db):
    result = {"estimated_lifetime_tax_savings": 100.0}
    auto_id, _ = await store.save("user_a", DEMO_SCENARIO, result)
    named_id, _ = await store.save("user_a", DEMO_SCENARIO, result, name="Mine", scenario={"a": 1})
    changed = DEMO_SCENARIO.model_copy(update={"traditional_ira_balance": 250_000})

    assert await store.update("user_b", auto_id, changed, result) is None
    assert await store.update("user_a", "not-a-uuid", changed, result) is None

    saved_id, name = await store.update(
        "user_a", auto_id, changed, {"estimated_lifetime_tax_savings": 999.0}
    )
    assert saved_id == auto_id and name == store.auto_name(changed)  # automatic name follows
    _, kept = await store.update("user_a", named_id, changed, result)
    assert kept == "Mine"
    assert (await store.get("user_a", named_id)).scenario == {"a": 1}  # chat copy kept

    listed = await store.list_for("user_a")
    assert [row.id for row in listed] == [named_id, auto_id]  # last saved first
    assert len(listed) == 2 and listed[1].estimated_savings == 999.0
    row = await store.get("user_a", auto_id)
    assert row.inputs.traditional_ira_balance == 250_000
    assert row.updated_at > row.created_at
