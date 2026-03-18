"""Tests for the /api/email endpoint."""


async def test_email_capture_valid(async_client):
    """POST /api/email with a valid email should return 200."""
    response = await async_client.post("/api/email", json={"email": "user@example.com"})
    assert response.status_code == 200


async def test_email_capture_invalid(async_client):
    """POST /api/email with an invalid email should return 422."""
    response = await async_client.post("/api/email", json={"email": "not-an-email"})
    assert response.status_code == 422
