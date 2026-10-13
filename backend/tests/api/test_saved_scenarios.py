"""REST routes for the web app's saved scenarios."""

from tests.auth_support import OTHER_USER, bearer, session_token

DRAFT = {
    "age": 52,
    "filing_status": "married_filing_jointly",
    "current_income": 90000,
    "traditional_balance": 600000,
    "retirement_age": 60,
}


async def test_save_list_open_rename_delete(async_client, clerk_env, memory_store):
    auth = bearer(session_token())
    created = await async_client.post(
        "/api/saved-scenarios", json={"draft": DRAFT, "name": "Plan A"}, headers=auth
    )
    assert created.status_code == 201
    scenario_id = created.json()["scenario_id"]
    assert created.json()["name"] == "Plan A"

    listed = await async_client.get("/api/saved-scenarios", headers=auth)
    assert [s["name"] for s in listed.json()["saved_scenarios"]] == ["Plan A"]

    opened = await async_client.get(f"/api/saved-scenarios/{scenario_id}", headers=auth)
    assert opened.status_code == 200
    assert opened.json()["draft"]["age"] == 52
    assert opened.json()["draft"]["timeline"]  # projected from this year

    renamed = await async_client.patch(
        f"/api/saved-scenarios/{scenario_id}", json={"name": "Plan B"}, headers=auth
    )
    assert renamed.json()["name"] == "Plan B"

    deleted = await async_client.delete(f"/api/saved-scenarios/{scenario_id}", headers=auth)
    assert deleted.status_code == 204
    missing = await async_client.get(f"/api/saved-scenarios/{scenario_id}", headers=auth)
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "not_found"


async def test_other_users_cannot_see_or_change(async_client, clerk_env, memory_store):
    created = await async_client.post(
        "/api/saved-scenarios", json={"draft": DRAFT}, headers=bearer(session_token())
    )
    scenario_id = created.json()["scenario_id"]
    other = bearer(session_token(OTHER_USER))
    assert (await async_client.get("/api/saved-scenarios", headers=other)).json() == {
        "saved_scenarios": []
    }
    for method in ("get", "delete"):
        response = await async_client.request(
            method, f"/api/saved-scenarios/{scenario_id}", headers=other
        )
        assert response.status_code == 404
    response = await async_client.patch(
        f"/api/saved-scenarios/{scenario_id}", json={"name": "Mine now"}, headers=other
    )
    assert response.status_code == 404


async def test_requires_sign_in(async_client, clerk_env, memory_store):
    assert (await async_client.get("/api/saved-scenarios")).status_code == 401
    expired = bearer(session_token(expires_in=-120))
    assert (await async_client.get("/api/saved-scenarios", headers=expired)).status_code == 401


async def test_unavailable_without_accounts_or_database(async_client, clerk_env, monkeypatch):
    auth = bearer(session_token())
    # Accounts on, no database.
    response = await async_client.get("/api/saved-scenarios", headers=auth)
    assert response.status_code == 503
    # No accounts at all.
    monkeypatch.delenv("CLERK_SECRET_KEY")
    response = await async_client.get("/api/saved-scenarios", headers=auth)
    assert response.status_code == 503


async def test_empty_draft_is_refused(async_client, clerk_env, memory_store):
    response = await async_client.post(
        "/api/saved-scenarios", json={"draft": {}}, headers=bearer(session_token())
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "empty"
