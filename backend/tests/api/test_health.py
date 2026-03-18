"""Tests for the health check endpoint."""


async def test_health_returns_200(async_client):
    """GET /health should return 200 with status ok."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
