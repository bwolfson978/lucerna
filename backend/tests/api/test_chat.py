"""Tests for the /api/chat endpoint.

Uses pytest-mock to mock the Anthropic SDK so no real API calls are made.
"""

from unittest.mock import MagicMock


async def test_chat_returns_response(async_client, mocker):
    """POST /api/chat with a valid message should return 200 with response text."""
    # Mock the Anthropic client's messages.create call
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="This is a test response about Roth conversions.")]

    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_response

    mocker.patch("app.api.chat.get_anthropic_client", return_value=mock_client)

    payload = {
        "message": "Should I do a Roth conversion?",
        "context": {"age": 45, "income": 85000},
    }
    response = await async_client.post("/api/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert isinstance(data["response"], str)
    assert len(data["response"]) > 0


async def test_chat_missing_message(async_client):
    """POST /api/chat without a message field should return 422."""
    response = await async_client.post("/api/chat", json={})
    assert response.status_code == 422
