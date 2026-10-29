"""Langfuse tracing for the website assistant: the full conversation of each turn.

Unlike the PostHog events in ``app.agent.observability``, these traces hold the
content: the user's message, every model call's input and output, and every tool
call's arguments and result, so replies can be read and scored by LLM judges.
That is why it is off unless ``LANGFUSE_TRACING`` is true and both keys are set,
and why email addresses and phone numbers are masked before anything is sent.

Each user message is one trace: a root ``website_assistant`` observation with one
generation per model call and one tool observation per tool call. The trace carries
the visitor's PostHog distinct id and session id, so it lines up with the PostHog
session. ``LANGFUSE_TRACING_ENVIRONMENT`` (production, ci or dev) separates
production traffic from CI eval runs in every Langfuse view.

Traces are kept until someone asks us to delete them (privacy policy); Langfuse's
free plan hides traces older than 30 days but never deletes them.

Nothing here raises: tracing must never break a reply.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

ROOT_NAME = "website_assistant"

_client: Any = None

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# 10+ digit phone numbers with optional separators; dollar amounts and years don't match.
_PHONE = re.compile(r"(?<![\w$.,])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\w|[.,]\d)")


def mask(*, data: Any, **_: Any) -> Any:
    """Replace email addresses and phone numbers anywhere in ``data``."""
    if isinstance(data, str):
        return _PHONE.sub("[phone]", _EMAIL.sub("[email]", data))
    if isinstance(data, dict):
        return {key: mask(data=value) for key, value in data.items()}
    if isinstance(data, list | tuple):
        return [mask(data=value) for value in data]
    return data


def enabled() -> bool:
    config = settings()
    return bool(
        config.langfuse_tracing and config.langfuse_public_key and config.langfuse_secret_key
    )


def client() -> Any:
    """The shared Langfuse client, created on first use. None when tracing is off."""
    global _client
    if _client is not None or not enabled():
        return _client
    try:
        from langfuse import Langfuse
        from langfuse.span_filter import is_langfuse_span

        config = settings()
        _client = Langfuse(
            public_key=config.langfuse_public_key,
            secret_key=config.langfuse_secret_key,
            base_url=config.langfuse_base_url,
            environment=config.langfuse_tracing_environment,
            release=config.railway_git_commit_sha or None,
            mask=mask,
            # Only our own observations. The Anthropic SDK emits OpenTelemetry spans of its
            # own; exported too, they would bypass the mask and count each call's cost twice.
            should_export_span=is_langfuse_span,
        )
    except Exception:  # noqa: BLE001
        logger.warning("Could not start Langfuse tracing", exc_info=True)
        _client = None
    return _client


def shutdown() -> None:
    """Send anything still queued. Called when the app stops."""
    global _client
    if _client is not None:
        try:
            _client.shutdown()
        except Exception:  # noqa: BLE001
            logger.warning("Could not flush Langfuse traces", exc_info=True)
        _client = None
