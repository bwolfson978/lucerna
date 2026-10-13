"""Product analytics (PostHog), server side.

The website reports its own events with posthog-js. The backend reports what happens
where the website can't see it: MCP tool calls from Claude, ChatGPT and the site's own
assistant (``app.mcp.analytics``). Events use the same person as the website (the
Clerk user id, or the browser's anonymous PostHog id) so one person's timeline covers
every channel.

Off unless ``POSTHOG_PROJECT_TOKEN`` is set (the same project token the website uses).
``POSTHOG_HOST`` defaults to PostHog's US cloud. Never send scenario values (ages,
incomes, balances) as event properties.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

from posthog import Posthog

logger = logging.getLogger(__name__)

DEFAULT_HOST = "https://us.i.posthog.com"

_lock = threading.Lock()
_client: Posthog | None = None
_override: Any = None


def client() -> Any:
    """The PostHog client, or None when analytics are off."""
    global _client
    if _override is not None:
        return _override
    token = os.environ.get("POSTHOG_PROJECT_TOKEN", "").strip()
    if not token:
        return None
    with _lock:
        if _client is None:
            _client = Posthog(
                token,
                host=os.environ.get("POSTHOG_HOST", "").strip() or DEFAULT_HOST,
                # Server IPs say nothing about where people are.
                disable_geoip=True,
            )
        return _client


def set_client(replacement: Any) -> None:
    """Send events to ``replacement`` instead (tests). None restores the default."""
    global _override
    _override = replacement


def capture(event: str, *, distinct_id: str | None, properties: dict[str, Any]) -> None:
    """Queue an event. Never raises: analytics must not break a request.

    Without a ``distinct_id`` PostHog records the event without a person profile.
    """
    posthog = client()
    if posthog is None:
        return
    try:
        posthog.capture(event, distinct_id=distinct_id, properties=properties)
    except Exception:  # pragma: no cover - the SDK queues and doesn't raise in practice
        logger.exception("Couldn't queue analytics event %s", event)


def shutdown() -> None:
    """Flush queued events (app shutdown)."""
    global _client
    with _lock:
        if _client is not None:
            try:
                _client.shutdown()
            except Exception:  # pragma: no cover
                logger.exception("Couldn't flush analytics events")
            _client = None
