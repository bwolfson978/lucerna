"""Tests for the /api/feedback endpoint."""

from unittest.mock import MagicMock

import pytest

from app import error_tracking
from app.tools import feedback


@pytest.fixture
def posthog(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", mock)
    feedback.limiter.reset()
    yield mock
    feedback.limiter.reset()


async def test_feedback_is_sent_to_posthog(async_client, posthog):
    response = await async_client.post(
        "/api/feedback",
        json={
            "kind": "problem",
            "message": "The savings number is negative",
            "page_url": "https://rothconversionsoptimizer.com/calculator",
            "distinct_id": "ph-1",
            "session_id": "sess-1",
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
    _, kwargs = posthog.capture.call_args
    props = kwargs["properties"]
    assert kwargs["distinct_id"] == "ph-1"
    assert props["$survey_id"] == feedback.SURVEYS[feedback.FeedbackKind.PROBLEM].id
    assert props["source"] == "web"
    assert props["$session_id"] == "sess-1"
    assert props["page_url"].endswith("/calculator")


async def test_kind_defaults_to_feedback(async_client, posthog):
    response = await async_client.post("/api/feedback", json={"message": "Nice"})
    assert response.status_code == 200
    _, kwargs = posthog.capture.call_args
    assert kwargs["properties"]["$survey_name"] == "Feedback"


async def test_invalid_submissions_are_rejected(async_client, posthog):
    empty = await async_client.post("/api/feedback", json={"message": "  "})
    assert empty.status_code == 422
    email = await async_client.post("/api/feedback", json={"message": "hi", "email": "x"})
    assert email.status_code == 422
    posthog.capture.assert_not_called()


async def test_daily_limit(async_client, posthog, monkeypatch):
    monkeypatch.setattr(feedback, "limiter", feedback.FeedbackLimiter(per_caller=1, per_day=10))
    assert (await async_client.post("/api/feedback", json={"message": "a"})).status_code == 200
    limited = await async_client.post("/api/feedback", json={"message": "b"})
    assert limited.status_code == 429
