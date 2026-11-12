"""POST /api/agent/feedback: ratings of assistant replies (formal/tla/ReplyRating.tla)."""

from unittest.mock import MagicMock

import pytest

from app import error_tracking
from app.agent import feedback, tracing

TRACE = "0123456789abcdef0123456789abcdef"


@pytest.fixture
def langfuse(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(tracing, "_client", mock)
    yield mock
    tracing._client = None


@pytest.fixture
def posthog(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", mock)
    return mock


@pytest.fixture(autouse=True)
def fresh():
    feedback.applied.reset()
    feedback.limiter.reset()
    yield
    feedback.applied.reset()
    feedback.limiter.reset()


def scores(langfuse):
    return {call.kwargs["name"]: call.kwargs for call in langfuse.create_score.call_args_list}


def deleted(langfuse):
    return [call.args[0] for call in langfuse.api.scores.delete.call_args_list]


async def rate(async_client, seq, rating, **fields):
    return await async_client.post(
        "/api/agent/feedback",
        json={"trace_id": TRACE, "seq": seq, "rating": rating, **fields},
        headers={"X-POSTHOG-DISTINCT-ID": "ph-1", "X-POSTHOG-SESSION-ID": "sess-1"},
    )


async def test_thumbs_down_becomes_scores_on_the_trace(async_client, langfuse, posthog):
    response = await rate(
        async_client,
        1,
        "down",
        reason="numbers_look_wrong",
        note="The 2027 tax looks high. Reach me at jane@example.com",
    )
    assert response.json() == {"success": True, "applied": True}
    sent = scores(langfuse)
    assert sent["user_rating"]["trace_id"] == TRACE
    assert sent["user_rating"]["score_id"] == f"{TRACE}-user_rating"
    assert sent["user_rating"]["value"] == 0
    assert sent["user_rating"]["comment"] == "The 2027 tax looks high. Reach me at [email]"
    assert sent["user_issue"]["value"] == "numbers_look_wrong"
    assert sent["user_issue"]["score_id"] == f"{TRACE}-user_issue"
    assert deleted(langfuse) == []


async def test_posthog_gets_the_rating_but_never_the_note(async_client, langfuse, posthog):
    await rate(async_client, 1, "down", reason="hard_to_follow", note="Too much jargon")
    _, kwargs = posthog.capture.call_args
    assert posthog.capture.call_args.args == ("assistant_reply_rated",)
    assert kwargs["distinct_id"] == "ph-1"
    assert kwargs["properties"] == {
        "rating": "down",
        "reason": "hard_to_follow",
        "has_note": True,
        "$ai_trace_id": TRACE,
        "$session_id": "sess-1",
    }
    assert "jargon" not in str(posthog.capture.call_args)


async def test_thumbs_up_has_no_reason(async_client, langfuse, posthog):
    await rate(async_client, 1, "up", reason="numbers_look_wrong")
    sent = scores(langfuse)
    assert sent["user_rating"]["value"] == 1
    assert "user_issue" not in sent
    assert deleted(langfuse) == [f"{TRACE}-user_issue"]
    assert posthog.capture.call_args.kwargs["properties"]["reason"] is None


async def test_clearing_a_rating_deletes_its_scores(async_client, langfuse, posthog):
    await rate(async_client, 1, "down", reason="did_not_answer")
    langfuse.reset_mock()
    await rate(async_client, 2, None)
    langfuse.create_score.assert_not_called()
    # Queued scores are sent before the delete, or they would land after it.
    assert langfuse.method_calls[0][0] == "flush"
    assert deleted(langfuse) == [f"{TRACE}-user_rating", f"{TRACE}-user_issue"]
    assert posthog.capture.call_args.kwargs["properties"]["rating"] == "none"


async def test_a_request_that_arrives_late_does_not_undo_a_newer_one(
    async_client, langfuse, posthog
):
    """ReplyRating LastPickWins: thumbs down (slow), then thumbs up, arrive swapped."""
    newer = await rate(async_client, 2, "up")
    langfuse.reset_mock()
    posthog.reset_mock()
    older = await rate(async_client, 1, "down", reason="did_not_answer")
    assert newer.json()["applied"] is True
    assert older.json() == {"success": True, "applied": False}
    langfuse.create_score.assert_not_called()
    posthog.capture.assert_not_called()


async def test_a_repeated_request_is_applied_once(async_client, langfuse, posthog):
    await rate(async_client, 1, "up")
    again = await rate(async_client, 1, "up")
    assert again.json()["applied"] is False
    assert langfuse.create_score.call_count == 1


async def test_works_with_tracing_off(async_client, posthog):
    response = await rate(async_client, 1, "up")
    assert response.json() == {"success": True, "applied": True}
    assert posthog.capture.call_args.kwargs["properties"]["rating"] == "up"


async def test_a_langfuse_failure_is_not_the_persons_problem(async_client, langfuse, posthog):
    langfuse.create_score.side_effect = RuntimeError("down")
    response = await rate(async_client, 1, "up")
    assert response.status_code == 200
    posthog.capture.assert_called_once()


async def test_rejects_ids_and_values_it_does_not_know(async_client, langfuse):
    bad_id = await async_client.post(
        "/api/agent/feedback", json={"trace_id": "nope", "seq": 1, "rating": "up"}
    )
    bad_reason = await rate(async_client, 1, "down", reason="other")
    long_note = await rate(async_client, 1, "down", note="x" * (feedback.MAX_NOTE + 1))
    assert [bad_id.status_code, bad_reason.status_code, long_note.status_code] == [422, 422, 422]
    langfuse.create_score.assert_not_called()


async def test_daily_limit(async_client, langfuse, monkeypatch):
    monkeypatch.setattr(feedback.limiter, "per_caller", 2)
    codes = [(await rate(async_client, seq, "up")).status_code for seq in (1, 2, 3)]
    assert codes == [200, 200, 429]
