"""Tests for the /api/feedback endpoint."""


async def test_feedback_submit(async_client):
    """POST /api/feedback with rating and comment should return 200."""
    payload = {
        "rating": 5,
        "comment": "Very helpful tool for understanding Roth conversions!",
    }
    response = await async_client.post("/api/feedback", json=payload)
    assert response.status_code == 200
