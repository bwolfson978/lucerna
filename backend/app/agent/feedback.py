"""Ratings of website assistant replies: the thumbs under each reply and the short
form behind them.

A rating is stored as Langfuse scores on the reply's trace (``TurnTrace.trace_id``,
sent to the page in the ``done`` event), so it sits next to the conversation it rates
and can be compared with the LLM judges' scores:

- ``user_rating``: 1 for a thumbs up, 0 for a thumbs down, with the person's note
  (emails and phone numbers masked) as its comment
- ``user_issue``: the reason picked for a thumbs down

PostHog gets one ``assistant_reply_rated`` event with the rating, the reason and
whether a note was written, never the note itself (see ``app.agent.observability``).

The page sends a reply's rating again whenever the person changes it, each time with a
higher ``seq``. Requests can arrive out of order (a slow one, or one the page gave up
on), so a request older than the newest one applied to that reply is ignored
(formal/tla/ReplyRating.tla). The score ids are fixed per reply, so a change
overwrites and a cleared rating deletes.

Limits are in process memory like the other limiters and reset at midnight UTC.
Nothing here raises for a Langfuse or PostHog failure: a rating must never show the
person an error they can do nothing about.
"""

from __future__ import annotations

import logging
import re
import threading
from collections import OrderedDict
from enum import StrEnum
from typing import Any

from app import error_tracking
from app.agent import tracing
from app.config import settings
from app.tools.feedback import FeedbackLimiter, FeedbackLimitReached

logger = logging.getLogger(__name__)

__all__ = ["FeedbackLimitReached", "Rating", "Reason", "record"]

EVENT = "assistant_reply_rated"
RATING_SCORE = "user_rating"
ISSUE_SCORE = "user_issue"
MAX_NOTE = 1000
TRACE_ID = re.compile(r"^[0-9a-f]{32}$")
# Replies whose newest applied request is remembered. A forgotten reply only loses
# the out-of-order guard, and only for requests still in flight from before.
MAX_REMEMBERED = 20_000


class Rating(StrEnum):
    UP = "up"
    DOWN = "down"


class Reason(StrEnum):
    NUMBERS = "numbers_look_wrong"
    MISSED = "did_not_answer"
    CONFUSING = "hard_to_follow"
    IGNORED = "ignored_something"
    OTHER = "something_else"


class _Applied:
    """The newest ``seq`` applied to each reply."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._seq: OrderedDict[str, int] = OrderedDict()

    def newer(self, trace_id: str, seq: int) -> bool:
        """Note ``seq`` and return True, unless this reply already had a newer one."""
        with self._lock:
            if seq <= self._seq.get(trace_id, -1):
                return False
            self._seq[trace_id] = seq
            self._seq.move_to_end(trace_id)
            while len(self._seq) > MAX_REMEMBERED:
                self._seq.popitem(last=False)
            return True

    def reset(self) -> None:
        with self._lock:
            self._seq.clear()


applied = _Applied()
limiter = FeedbackLimiter(
    per_caller=settings().reply_ratings_per_caller_per_day,
    per_day=settings().reply_ratings_per_day,
)


def record(
    *,
    trace_id: str,
    seq: int,
    rating: Rating | None,
    reason: Reason | None = None,
    note: str | None = None,
    caller: str | None,
    distinct_id: str | None = None,
    session_id: str | None = None,
) -> bool:
    """Store what the person now thinks of one reply. ``rating`` None clears it.
    Returns False when a newer request for this reply was already applied.
    Raises FeedbackLimitReached past the daily limits."""
    limiter.charge(caller)
    if not applied.newer(trace_id, seq):
        return False
    if rating is not Rating.DOWN:
        reason = None
    note = (note or "").strip()[:MAX_NOTE] or None
    if rating is None:
        note = None
    _to_langfuse(trace_id, rating, reason, note)
    _to_posthog(trace_id, rating, reason, note is not None, distinct_id, session_id)
    return True


def _score_id(trace_id: str, name: str) -> str:
    return f"{trace_id}-{name}"


def _to_langfuse(trace_id: str, rating: Rating | None, reason: Reason | None, note: str | None):
    langfuse = tracing.client()
    if langfuse is None:
        logger.info("Reply rated (%s, %s, tracing off)", rating, reason)
        return
    try:
        if rating is not None:
            langfuse.create_score(
                trace_id=trace_id,
                score_id=_score_id(trace_id, RATING_SCORE),
                name=RATING_SCORE,
                value=1 if rating is Rating.UP else 0,
                data_type="BOOLEAN",
                comment=tracing.mask(data=note) if note else None,
            )
        if reason is not None:
            langfuse.create_score(
                trace_id=trace_id,
                score_id=_score_id(trace_id, ISSUE_SCORE),
                name=ISSUE_SCORE,
                value=reason.value,
                data_type="CATEGORICAL",
            )
        stale = [
            name for name, kept in ((RATING_SCORE, rating), (ISSUE_SCORE, reason)) if kept is None
        ]
        if stale:
            # Scores are sent in batches; one still queued would land after its delete.
            langfuse.flush()
            for name in stale:
                _delete_score(langfuse, _score_id(trace_id, name))
    except Exception:  # noqa: BLE001
        logger.warning("Could not store a reply rating in Langfuse", exc_info=True)


def _delete_score(langfuse: Any, score_id: str) -> None:
    try:
        langfuse.api.scores.delete(score_id)
    except Exception:  # noqa: BLE001
        # Usually there was nothing to delete (a thumbs up has no reason).
        logger.debug("No Langfuse score %s to delete", score_id, exc_info=True)


def _to_posthog(
    trace_id: str,
    rating: Rating | None,
    reason: Reason | None,
    has_note: bool,
    distinct_id: str | None,
    session_id: str | None,
) -> None:
    posthog = error_tracking.client()
    if posthog is None:
        return
    try:
        props: dict[str, Any] = {
            "rating": rating.value if rating else "none",
            "reason": reason.value if reason else None,
            "has_note": has_note,
            "$ai_trace_id": trace_id,
        }
        if session_id:
            props["$session_id"] = session_id
        if not distinct_id:
            distinct_id = trace_id
            props["$process_person_profile"] = False
        posthog.capture(EVENT, distinct_id=distinct_id, properties=props)
    except Exception:  # noqa: BLE001
        logger.warning("Could not send a reply rating event", exc_info=True)
