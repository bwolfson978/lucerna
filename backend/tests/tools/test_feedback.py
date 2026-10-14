"""Feedback and problem reports: what reaches PostHog, and the limits."""

from unittest.mock import MagicMock

import pytest

from app import error_tracking
from app.tools import feedback
from app.tools.feedback import FeedbackKind


@pytest.fixture
def posthog(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", mock)
    feedback.limiter.reset()
    yield mock
    feedback.limiter.reset()


def _sent(posthog) -> tuple[str, dict]:
    (event,), kwargs = posthog.capture.call_args
    assert event == "survey sent"
    return kwargs["distinct_id"], kwargs["properties"]


def test_problem_report_fills_the_survey(posthog):
    survey = feedback.SURVEYS[FeedbackKind.PROBLEM]
    feedback.submit(
        FeedbackKind.PROBLEM,
        "  The chart is blank  ",
        source="claude",
        caller="ip:1.2.3.4",
        expected="A chart",
        email="a@b.co",
        context={"results_url": "https://x/calculator?s=1", "error_digest": ""},
    )
    distinct_id, props = _sent(posthog)
    assert distinct_id.startswith("feedback-anon:")
    assert props["$process_person_profile"] is False
    assert props["$survey_id"] == survey.id
    assert props["$survey_completed"] is True
    assert props[f"$survey_response_{survey.message}"] == "The chart is blank"
    assert props[f"$survey_response_{survey.expected}"] == "A chart"
    assert props[f"$survey_response_{survey.email}"] == "a@b.co"
    assert [q["id"] for q in props["$survey_questions"]] == [
        survey.message,
        survey.expected,
        survey.email,
    ]
    assert props["source"] == "claude"
    assert props["results_url"] == "https://x/calculator?s=1"
    assert "error_digest" not in props
    assert props["$geoip_disable"] is True


def test_web_feedback_keeps_the_person(posthog):
    survey = feedback.SURVEYS[FeedbackKind.FEEDBACK]
    feedback.submit(
        FeedbackKind.FEEDBACK,
        "Love it",
        source=feedback.WEB,
        caller="ip:1.2.3.4",
        expected="ignored for feedback",
        distinct_id="ph-123",
    )
    distinct_id, props = _sent(posthog)
    assert distinct_id == "ph-123"
    assert "$process_person_profile" not in props
    assert "$geoip_disable" not in props
    assert props[f"$survey_response_{survey.message}"] == "Love it"
    assert props[f"$survey_response_{survey.email}"] == ""
    assert len(props["$survey_questions"]) == 2


@pytest.mark.parametrize("message", ["", "   "])
def test_empty_messages_are_refused(posthog, message):
    with pytest.raises(feedback.FeedbackError):
        feedback.submit(FeedbackKind.FEEDBACK, message, source="web", caller="ip:x")
    posthog.capture.assert_not_called()


def test_bad_email_is_refused(posthog):
    with pytest.raises(feedback.FeedbackError, match="email"):
        feedback.submit(FeedbackKind.FEEDBACK, "hi", source="web", caller="ip:x", email="nope")


def test_long_messages_are_cut(posthog):
    feedback.submit(FeedbackKind.FEEDBACK, "x" * 5000, source="web", caller="ip:x")
    _, props = _sent(posthog)
    survey = feedback.SURVEYS[FeedbackKind.FEEDBACK]
    assert len(props[f"$survey_response_{survey.message}"]) == feedback.MAX_MESSAGE


def test_without_posthog_nothing_is_sent(monkeypatch):
    monkeypatch.setattr(error_tracking, "_client", None)
    feedback.limiter.reset()
    assert feedback.submit(FeedbackKind.FEEDBACK, "hi", source="web", caller=None)


def test_limits_per_caller_and_overall():
    limiter = feedback.FeedbackLimiter(per_caller=2, per_day=3)
    limiter.charge("ip:a")
    limiter.charge("ip:a")
    with pytest.raises(feedback.FeedbackLimitReached):
        limiter.charge("ip:a")
    limiter.charge("ip:b")
    with pytest.raises(feedback.FeedbackLimitReached):
        limiter.charge(None)
