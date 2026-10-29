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

The same trace also goes to Langfuse with its content when conversation tracing is
on (see ``app.agent.tracing``); otherwise those methods do nothing.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Request

from app import error_tracking
from app.agent import tracing
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
    # Langfuse observations for this turn, when conversation tracing is on.
    _root: Any = field(default=None, init=False, repr=False)
    _attributes: Any = field(default=None, init=False, repr=False)
    _generation: Any = field(default=None, init=False, repr=False)
    _started: datetime | None = field(default=None, init=False, repr=False)
    _reply: str = field(default="", init=False, repr=False)
    _error: str | None = field(default=None, init=False, repr=False)

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
        output: list[dict] | None = None,
    ) -> None:
        """Send one ``$ai_generation`` and end the Langfuse generation, if one is open.
        Never raises: analytics must not break a turn."""
        self._end_generation(
            model=model,
            usage=usage,
            time_to_first_token=time_to_first_token,
            stop_reason=stop_reason,
            error=error,
            output=output,
        )
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

    # --- Langfuse: the conversation itself (app.agent.tracing) -----------------------

    def start(self, text: str) -> None:
        """Open the turn's Langfuse trace with the user's message.

        The visitor's ids stay attached to every observation until ``end``, which must
        run in the same task (the agent loop's worker)."""
        langfuse = tracing.client()
        if langfuse is None:
            return
        try:
            from langfuse import propagate_attributes

            self._attributes = propagate_attributes(
                user_id=self.distinct_id,
                session_id=self.session_id,
                trace_name=tracing.ROOT_NAME,
            )
            self._attributes.__enter__()
            self._root = langfuse.start_observation(
                name=tracing.ROOT_NAME, as_type="agent", input=text
            )
        except Exception:  # noqa: BLE001
            logger.warning("Could not start a Langfuse trace", exc_info=True)
            self._root = None

    def start_generation(self, *, model: str, system: str, messages: list[dict]) -> None:
        """Open a Langfuse generation for one model call."""
        if self._root is None:
            return
        try:
            self._started = datetime.now(UTC)
            self._generation = self._root.start_observation(
                name="claude",
                as_type="generation",
                model=model,
                input=[{"role": "system", "content": system}, *messages],
            )
        except Exception:  # noqa: BLE001
            logger.warning("Could not start a Langfuse generation", exc_info=True)
            self._generation = None

    def _end_generation(
        self,
        *,
        model: str,
        usage: dict[str, Any] | None,
        time_to_first_token: float | None,
        stop_reason: str | None,
        error: str | None,
        output: list[dict] | None,
    ) -> None:
        generation, self._generation = self._generation, None
        if generation is None:
            return
        try:
            usage = usage or {}
            counts = {
                "input": int(usage.get("input_tokens") or 0),
                "output": int(usage.get("output_tokens") or 0),
                "cache_read_input_tokens": int(usage.get("cache_read_input_tokens") or 0),
                "cache_creation_input_tokens": int(usage.get("cache_creation_input_tokens") or 0),
            }
            price = prices_per_mtok(model)
            cost = {
                "input": counts["input"] * price["input"] / 1_000_000,
                "output": counts["output"] * price["output"] / 1_000_000,
                "cache_read_input_tokens": counts["cache_read_input_tokens"]
                * price["cache_read"]
                / 1_000_000,
                "cache_creation_input_tokens": counts["cache_creation_input_tokens"]
                * price["cache_write"]
                / 1_000_000,
            }
            cost["total"] = sum(cost.values())
            first_token = (
                self._started + timedelta(seconds=time_to_first_token)
                if self._started is not None and time_to_first_token is not None
                else None
            )
            generation.update(
                model=model,
                output=output,
                usage_details=counts,
                cost_details=cost,
                completion_start_time=first_token,
                metadata={"stop_reason": stop_reason},
                **({"level": "ERROR", "status_message": error} if error else {}),
            )
            generation.end()
            text = _text_of(output)
            if text:
                self._reply = text
        except Exception:  # noqa: BLE001
            logger.warning("Could not end a Langfuse generation", exc_info=True)

    @contextmanager
    def tool(self, name: str, arguments: Any) -> Iterator[ToolRecord]:
        """Record one tool call: ``with trace.tool(name, args) as record: record(result, is_error)``."""
        observation = None
        if self._root is not None:
            try:
                observation = self._root.start_observation(
                    name=name, as_type="tool", input=arguments
                )
            except Exception:  # noqa: BLE001
                logger.warning("Could not start a Langfuse tool observation", exc_info=True)
        record = ToolRecord()
        try:
            yield record
        finally:
            if observation is not None:
                try:
                    observation.update(
                        output=record.result,
                        **({"level": "ERROR"} if record.is_error else {}),
                    )
                    observation.end()
                except Exception:  # noqa: BLE001
                    logger.warning("Could not end a Langfuse tool observation", exc_info=True)

    def error(self, code: str) -> None:
        """Note the error code the turn ended with."""
        self._error = code

    def end(self) -> None:
        """Close the turn's Langfuse trace with the reply it ended with."""
        root, self._root = self._root, None
        attributes, self._attributes = self._attributes, None
        try:
            if root is not None:
                root.update(
                    output=self._reply or None,
                    **({"level": "WARNING", "status_message": self._error} if self._error else {}),
                )
                root.end()
            if attributes is not None:
                attributes.__exit__(None, None, None)
        except Exception:  # noqa: BLE001
            logger.warning("Could not end a Langfuse trace", exc_info=True)


@dataclass
class ToolRecord:
    """What a tool call returned, filled in by the caller of ``TurnTrace.tool``."""

    result: Any = None
    is_error: bool = False

    def __call__(self, result: Any, is_error: bool) -> None:
        self.result = result
        self.is_error = is_error


def _text_of(content: list[dict] | None) -> str:
    return "".join(
        block.get("text", "") for block in content or [] if block.get("type") == "text"
    ).strip()
