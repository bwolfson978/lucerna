"""Saved-scenario endpoints (app/api/scenarios.py) against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a disposable database, like tests/db.
"""

import os

import pytest

from app.auth.clerk import get_current_user
from app.db import session
from app.engine.demo import DEMO_SCENARIO
from app.main import app

DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(not DATABASE_URL, reason="TEST_DATABASE_URL not set")

DRAFT = {
    "age": 55,
    "filing_status": "single",
    "current_income": 70000,
    "traditional_balance": 400000,
    "retirement_age": 62,
}


@pytest.fixture
async def db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    await session.init_db()
    user = {"id": "user_a"}
    app.dependency_overrides[get_current_user] = lambda: user["id"]
    yield user
    app.dependency_overrides.pop(get_current_user, None)
    async with session.get_pool().acquire() as conn:
        await conn.execute("DROP TABLE IF EXISTS scenarios")
    await session.close_db()


def _body(**draft):
    return {
        "input": DEMO_SCENARIO.model_dump(mode="json"),
        "result": {"estimated_lifetime_tax_savings": 10.0},
        "draft": {**DRAFT, **draft},
    }


async def test_a_scenario_keeps_its_id_as_it_is_saved_again(async_client, db):
    created = (await async_client.post("/api/scenarios", json=_body())).json()
    updated = await async_client.put(f"/api/scenarios/{created['id']}", json=_body(age=56))
    assert updated.status_code == 200 and updated.json()["id"] == created["id"]

    listed = (await async_client.get("/api/scenarios")).json()
    assert [s["id"] for s in listed] == [created["id"]]
    assert listed[0]["updated_at"] >= listed[0]["created_at"]

    detail = (await async_client.get(f"/api/scenarios/{created['id']}")).json()
    assert detail["draft"]["age"] == 56 and detail["draft"]["retirement_age"] == 62


async def test_only_the_owner_can_update(async_client, db):
    created = (await async_client.post("/api/scenarios", json=_body())).json()
    db["id"] = "user_b"
    response = await async_client.put(f"/api/scenarios/{created['id']}", json=_body(age=60))
    assert response.status_code == 404
    missing = "00000000-0000-0000-0000-000000000000"
    assert (await async_client.put(f"/api/scenarios/{missing}", json=_body())).status_code == 404


async def test_a_save_without_a_draft_reopens_from_its_inputs(async_client, db):
    body = _body()
    del body["draft"]
    created = (await async_client.post("/api/scenarios", json=body)).json()
    detail = (await async_client.get(f"/api/scenarios/{created['id']}")).json()
    assert detail["draft"]["age"] == DEMO_SCENARIO.age
