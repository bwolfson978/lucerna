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
