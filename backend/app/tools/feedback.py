"""Feedback and problem reports, sent to PostHog Surveys.

One function for every channel: the website form (``POST /api/feedback``) and the
``send_feedback`` / ``report_problem`` MCP tools that ChatGPT and Claude users reach.
Each submission becomes a ``survey sent`` event on one of two API surveys in PostHog
project 364668, so all of them are read in one place (Surveys > Feedback, Surveys >
Report a problem). The survey and question ids below come from those surveys; changing
a question there means changing its id here.

Uses the API's PostHog client (``app.error_tracking``). Without ``POSTHOG_PROJECT_TOKEN``
nothing is sent and submissions are only logged, so local development works offline.

Limits (in process memory, reset at midnight UTC): a few submissions per caller per day,
and a ceiling across everyone, since Claude users share Anthropic's IP addresses and a
per-IP count alone can't stop a script.
"""

from __future__ import annotations

import datetime
import logging
import os
import re
import threading
import uuid
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app import error_tracking

logger = logging.getLogger(__name__)

EVENT = "survey sent"

MAX_MESSAGE = 2000
MAX_EMAIL = 254
MAX_CONTEXT = 500

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class FeedbackKind(StrEnum):
    FEEDBACK = "feedback"
    PROBLEM = "problem"


@dataclass(frozen=True)
class Survey:
    id: str
    name: str
    # Question ids, in the survey's order.
    message: str
    email: str
    expected: str | None = None


SURVEYS = {
    FeedbackKind.FEEDBACK: Survey(
        id="01a13887-4107-0000-852f-57581b619435",
        name="Feedback",
        message="79086183-a69c-484a-b463-1b4d7db63c40",
        email="8d395733-214a-4f82-b567-a27025b04b93",
    ),
    FeedbackKind.PROBLEM: Survey(
        id="01a13887-4d53-0000-bf62-acb50dc321cf",
        name="Report a problem",
        message="b04d7212-2516-4f6a-a7fc-b6b431c4874b",
        expected="f029a056-7ce3-42da-acc7-f641479c57d7",
        email="85830f91-6b10-4164-89e1-3e0e8d428c89",
    ),
}

QUESTIONS = {
    "message": {
        FeedbackKind.FEEDBACK: "What's on your mind?",
        FeedbackKind.PROBLEM: "What went wrong?",
    },
    "expected": "What did you expect to happen?",
    "email": "Email, if you'd like a reply",
}

# Where a submission came from, stored as the event's ``source`` property.
WEB = "web"
WEB_ASSISTANT = "web_assistant"
CHATGPT = "chatgpt"
CLAUDE = "claude"
OTHER_MCP = "mcp_other"


class FeedbackError(ValueError):
    """The submission can't be sent as given (shown to the user or the model)."""


class FeedbackLimitReached(Exception):
    """Too many submissions today, from this caller or from everyone."""


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


class FeedbackLimiter:
    def __init__(self, per_caller: int | None = None, per_day: int | None = None):
        self.per_caller = per_caller or _env_int("FEEDBACK_PER_CALLER_PER_DAY", 10)
        self.per_day = per_day or _env_int("FEEDBACK_PER_DAY", 500)
        self._lock = threading.Lock()
        self._day = self._today()
        self._counts: dict[str, int] = {}
        self._total = 0

    @staticmethod
    def _today() -> datetime.date:
        return datetime.datetime.now(datetime.UTC).date()

    def charge(self, caller: str | None) -> None:
        """Count one submission, or raise FeedbackLimitReached. ``None`` (a trusted
        in-process caller) only counts toward the ceiling."""
        with self._lock:
            if (today := self._today()) != self._day:
                self._day, self._counts, self._total = today, {}, 0
            if self._total >= self.per_day:
                raise FeedbackLimitReached
            if caller is not None:
                if self._counts.get(caller, 0) >= self.per_caller:
                    raise FeedbackLimitReached
                self._counts[caller] = self._counts.get(caller, 0) + 1
            self._total += 1

    def reset(self) -> None:
        with self._lock:
            self._day, self._counts, self._total = self._today(), {}, 0


limiter = FeedbackLimiter()


def _clean(text: str | None, limit: int) -> str | None:
    if text is None:
        return None
    text = text.strip()
    return text[:limit] if text else None


def clean_email(email: str | None) -> str | None:
    email = _clean(email, MAX_EMAIL)
    if email is not None and not _EMAIL_RE.match(email):
        raise FeedbackError("That email address doesn't look right.")
    return email


def submit(
    kind: FeedbackKind,
    message: str,
    *,
    source: str,
    caller: str | None,
    expected: str | None = None,
    email: str | None = None,
    distinct_id: str | None = None,
    context: dict[str, Any] | None = None,
) -> str:
    """Send one submission and return its id. ``caller`` is the limiter key
    ("ip:..." or "user:..."); ``distinct_id`` is the PostHog person, when known
    (the website's PostHog id or a signed-in user id). ``context`` adds properties
    such as the page or the error digest; empty values are dropped."""
    text = _clean(message, MAX_MESSAGE)
    if text is None:
        raise FeedbackError("The message is empty.")
    email = clean_email(email)
    expected = _clean(expected, MAX_MESSAGE) if kind is FeedbackKind.PROBLEM else None
    limiter.charge(caller)

    survey = SURVEYS[kind]
    answers = [(survey.message, QUESTIONS["message"][kind], text)]
    if survey.expected:
        answers.append((survey.expected, QUESTIONS["expected"], expected))
    answers.append((survey.email, QUESTIONS["email"], email))

    submission_id = str(uuid.uuid4())
    properties: dict[str, Any] = {
        "$survey_id": survey.id,
        "$survey_name": survey.name,
        "$survey_submission_id": submission_id,
        "$survey_completed": True,
        "$survey_questions": [
            {"id": qid, "question": question, "response": answer}
            for qid, question, answer in answers
        ],
        **{f"$survey_response_{qid}": answer or "" for qid, _, answer in answers},
        "source": source,
        **{
            key: str(value)[:MAX_CONTEXT]
            for key, value in (context or {}).items()
            if value not in (None, "")
        },
    }
    if distinct_id is None:
        # Anonymous chat users: count the report without creating a person for it.
        distinct_id = f"feedback-anon:{submission_id}"
        properties["$process_person_profile"] = False
    if source != WEB:
        # The server's address says nothing about where the person is.
        properties["$geoip_disable"] = True

    posthog = error_tracking.client()
    if posthog is None:
        logger.info("Feedback (%s, %s, PostHog not configured): %s", kind, source, text)
        return submission_id
    try:
        posthog.capture(EVENT, distinct_id=distinct_id, properties=properties)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not send feedback to PostHog", exc_info=True)
        raise FeedbackError("Feedback couldn't be sent right now. Try again later.") from exc
    return submission_id
