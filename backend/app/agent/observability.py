"""PostHog AI Observability for the website assistant: one ``$ai_generation`` per
model call.

Privacy mode by construction: prompts and replies hold people's finances, so only
the model, token counts, cost, latency, stop reason and errors are sent, never
``$ai_input`` or ``$ai_output_choices``. Events are captured by hand because the
PostHog Anthropic wrapper doesn't cover ``beta.messages``, which the refusal
fallback needs.

Each user message is one trace. The website sends its PostHog ids in the
``X-POSTHOG-DISTINCT-ID`` and ``X-POSTHOG-SESSION-ID`` headers, so generations land on
the visitor's person and session (and its replay). Without them a generation has no
person profile. Without ``POSTHOG_PROJECT_TOKEN`` nothing is sent.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request

from app import error_tracking
from app.agent.limits import prices_per_mtok

logger = logging.getLogger(__name__)

DISTINCT_ID_HEADER = "x-posthog-distinct-id"
SESSION_ID_HEADER = "x-posthog-session-id"
SPAN_NAME = "website_assistant"
MAX_ID = 200


def _header(request: Request, name: str) -> str | None:
    value = request.headers.get(name, "").strip()
    return value[:MAX_ID] or None


@dataclass
class TurnTrace:
    """The trace for one user message to the website assistant."""

    distinct_id: str | None = None
    session_id: str | None = None
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    @classmethod
    def from_request(cls, request: Request) -> TurnTrace:
        return cls(
            distinct_id=_header(request, DISTINCT_ID_HEADER),
            session_id=_header(request, SESSION_ID_HEADER),
        )

    def generation(
        self,
        *,
        model: str,
        usage: dict[str, Any] | None = None,
        latency: float,
        time_to_first_token: float | None = None,
        stop_reason: str | None = None,
        error: str | None = None,
    ) -> None:
        """Send one ``$ai_generation``. Never raises: analytics must not break a turn."""
        posthog = error_tracking.client()
        if posthog is None:
            return
        try:
            usage = usage or {}
            price = prices_per_mtok(model)
            props: dict[str, Any] = {
                "$ai_trace_id": self.trace_id,
                "$ai_session_id": self.session_id,
                "$ai_span_name": SPAN_NAME,
                "$ai_provider": "anthropic",
                "$ai_model": model,
                "$ai_stream": True,
                "$ai_latency": round(latency, 3),
                "$ai_input_tokens": int(usage.get("input_tokens") or 0),
                "$ai_output_tokens": int(usage.get("output_tokens") or 0),
                "$ai_cache_read_input_tokens": int(usage.get("cache_read_input_tokens") or 0),
                "$ai_cache_creation_input_tokens": int(
                    usage.get("cache_creation_input_tokens") or 0
                ),
                # Our prices (app.agent.limits), per token, so cost matches the spend cap.
                "$ai_input_token_price": price["input"] / 1_000_000,
                "$ai_output_token_price": price["output"] / 1_000_000,
                "$ai_cache_read_token_price": price["cache_read"] / 1_000_000,
                "$ai_cache_write_token_price": price["cache_write"] / 1_000_000,
                "$ai_is_error": error is not None,
                "stop_reason": stop_reason,
                # The server's address says nothing about where the person is.
                "$geoip_disable": True,
            }
            if time_to_first_token is not None:
                props["$ai_time_to_first_token"] = round(time_to_first_token, 3)
            if error is not None:
                props["$ai_error"] = error
            if self.session_id:
                props["$session_id"] = self.session_id
            distinct_id = self.distinct_id
            if not distinct_id:
                distinct_id = self.trace_id
                props["$process_person_profile"] = False
            posthog.capture("$ai_generation", distinct_id=distinct_id, properties=props)
        except Exception:  # noqa: BLE001
            logger.warning("Could not send an AI generation event", exc_info=True)
