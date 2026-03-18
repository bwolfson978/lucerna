"""Tests for the /api/optimize endpoint."""


async def test_optimize_valid_input(async_client, sample_single_input):
    """POST /api/optimize with valid inputs should return 200."""
    response = await async_client.post("/api/optimize", json=sample_single_input())
    assert response.status_code == 200
    data = response.json()
    assert "optimal_conversion" in data


async def test_optimize_missing_fields(async_client):
    """POST /api/optimize with empty body should return 422 validation error."""
    response = await async_client.post("/api/optimize", json={})
    assert response.status_code == 422
