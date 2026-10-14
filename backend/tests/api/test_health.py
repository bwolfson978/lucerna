"""Tests for the health check endpoint."""


async def test_health_returns_200(async_client):
    """GET /health should return 200 with status ok."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "lucerna-api"


async def test_favicon_served(async_client):
    response = await async_client.get("/favicon.ico")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/x-icon"
    assert response.content[:4] == b"\x00\x00\x01\x00"


async def test_openai_apps_challenge_serves_token(async_client, monkeypatch):
    monkeypatch.setenv("OPENAI_APPS_CHALLENGE", "tok_123\n")
    response = await async_client.get("/.well-known/openai-apps-challenge")
    assert response.status_code == 200
    assert response.text == "tok_123"
    assert response.headers["content-type"].startswith("text/plain")


async def test_openai_apps_challenge_missing_without_token(async_client, monkeypatch):
    monkeypatch.delenv("OPENAI_APPS_CHALLENGE", raising=False)
    response = await async_client.get("/.well-known/openai-apps-challenge")
    assert response.status_code == 404
