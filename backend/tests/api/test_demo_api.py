"""Tests for the /api/demo endpoint."""


async def test_get_demo(async_client):
    """GET /api/demo should return 200 with demo result data."""
    response = await async_client.get("/api/demo")
    assert response.status_code == 200
    data = response.json()
    assert "persona" in data
    assert "result" in data
    assert "yearly_conversions" in data["result"]
