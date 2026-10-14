"""DELETE /api/account."""

import pytest

from app.api import account
from app.auth.clerk import get_current_user
from app.main import app


@pytest.fixture
def signed_in():
    app.dependency_overrides[get_current_user] = lambda: "user_a"
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def test_deletes_every_saved_scenario(async_client, signed_in, monkeypatch):
    calls = []

    async def delete_all(user_id):
        calls.append(user_id)
        return 3

    monkeypatch.setattr(account.store, "delete_all", delete_all)
    response = await async_client.delete("/api/account")
    assert response.status_code == 200
    assert response.json() == {"deleted_scenarios": 3}
    assert calls == ["user_a"]


async def test_fails_without_a_database(async_client, signed_in, monkeypatch):
    async def delete_all(user_id):
        raise account.store.StorageUnavailable("Database not available")

    monkeypatch.setattr(account.store, "delete_all", delete_all)
    response = await async_client.delete("/api/account")
    assert response.status_code == 503


async def test_requires_sign_in(async_client):
    response = await async_client.delete("/api/account")
    assert response.status_code == 401
