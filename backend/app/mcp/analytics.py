"""Product analytics for the MCP server: one PostHog event per tool call.

Calls from ChatGPT and Claude never touch the website, so without this their usage is
invisible in PostHog. Each call sends ``mcp_tool_called`` with the tool, the client
it came from and how it went. It uses the API's PostHog client
(``app.error_tracking``), so without ``POSTHOG_PROJECT_TOKEN`` nothing is sent.

It also turns on PostHog MCP Analytics (``instrument``), which sends the standard
``$mcp_tool_call`` events for PostHog's MCP Analytics views. ``mcp_tool_called`` stays:
the "Usage by channel" dashboard is built on it and it carries our own properties.

Who the event belongs to:
- Signed in: the Clerk user id, the same id the website identifies people with, so
  chat and website usage land on one person.
- ChatGPT, anonymous: its anonymized per-user id (``openai/subject`` in the request
  ``_meta``), without a person profile.
- Anyone else anonymous (Claude sends no user id, and its calls arrive from shared
  Anthropic addresses): a fresh id per call, so these count calls, not people.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from typing import Any

from posthog.mcp import McpAnalytics
from posthog.mcp import instrument as posthog_instrument
from posthog.mcp.types import MCPAnalyticsOptions, UserIdentity

from app import error_tracking
from app.config import settings

logger = logging.getLogger(__name__)

EVENT = "mcp_tool_called"

CLAUDE = "claude"
CHATGPT = "chatgpt"
# The web app's own assistant, in process or over HTTP with the internal token.
WEB = "lucerna_web"
OTHER = "other"

# Set per HTTP request by the MCP route (app.mcp.server._IdentifyCaller).
current_client: ContextVar[str | None] = ContextVar("mcp_client", default=None)
current_user_agent: ContextVar[str] = ContextVar("mcp_user_agent", default="")

MAX_USER_AGENT = 200


def client_from(user_agent: str, *, internal: bool = False) -> str:
    """Which app a request came from, by its User-Agent (Claude sends "Claude-User",
    ChatGPT "openai-mcp/...")."""
    if internal:
        return WEB
    ua = user_agent.lower()
    if "claude" in ua or "anthropic" in ua:
        return CLAUDE
    if "openai" in ua or "chatgpt" in ua:
        return CHATGPT
    return OTHER


def resolve_client(request_meta: dict[str, Any]) -> str:
    """The calling app for this tool call. No HTTP request means the web assistant's
    in-process connection. ChatGPT also marks its calls with ``openai/*`` meta keys,
    which covers a User-Agent this module doesn't recognize."""
    client = current_client.get()
    if client is None:
        return WEB
    if client == OTHER and any(key.startswith("openai/") for key in request_meta):
        return CHATGPT
    return client


def link_source(client: str) -> str | None:
    """utm_source for links handed to a chat app; None for the web app's own links."""
    return None if client == WEB else client


def tool_called(
    tool: str,
    *,
    client: str,
    user_id: str | None,
    request_meta: dict[str, Any],
    properties: dict[str, Any],
) -> None:
    """Send one ``mcp_tool_called`` event. Never raises: analytics must not break a call."""
    posthog = error_tracking.client()
    if posthog is None:
        return
    try:
        props: dict[str, Any] = {
            "tool": tool,
            "client": client,
            "signed_in": user_id is not None,
            "user_agent": current_user_agent.get()[:MAX_USER_AGENT],
            # The server's address says nothing about where the person is.
            "$geoip_disable": True,
            **properties,
        }
        subject = request_meta.get("openai/subject")
        if user_id:
            distinct_id = user_id
        else:
            props["$process_person_profile"] = False
            if isinstance(subject, str) and subject:
                distinct_id = f"chatgpt:{subject}"
            else:
                distinct_id = f"mcp-anon:{uuid.uuid4()}"
        if locale := request_meta.get("openai/locale"):
            props["locale"] = str(locale)[:20]
        posthog.capture(EVENT, distinct_id=distinct_id, properties=props)
    except Exception:  # noqa: BLE001
        logger.warning("Could not send an MCP analytics event", exc_info=True)


# --------------------------------------------------------------------------
# PostHog MCP Analytics ($mcp_tool_call)
# --------------------------------------------------------------------------

# Tool inputs and results hold the user's finances; the privacy policy says unsaved
# analysis inputs aren't kept, so only the tool name, timing and outcome are sent.
_DROPPED = ("$mcp_parameters", "$mcp_response")

_handle: McpAnalytics | None = None


def _before_send(event: dict[str, Any]) -> dict[str, Any]:
    properties = event.get("properties") or {}
    for key in _DROPPED:
        properties.pop(key, None)
    return event


def instrument(server: Any, signed_in_user: Callable[[], str | None]) -> None:
    """Send ``$mcp_tool_call`` for every call of ``server``'s tools. Must run before
    ``server.streamable_http_app()``. No-op without ``POSTHOG_PROJECT_TOKEN``.

    The SDK adds a required ``context`` argument to every tool: the agent's one-line
    reason for the call, sent as ``$mcp_intent``. Its default description forbids
    personal details. ``llm_model`` and ``conversation_id`` are off: chat apps don't
    know their model id, and the conversation id never reaches our results. Signed-in
    callers get their Clerk user id; anyone else is the SDK's per-session id, without
    a person profile.
    """
    global _handle
    posthog = error_tracking.init()
    if posthog is None:
        return

    def identify(_request: Any, _extra: Any) -> UserIdentity | None:
        user_id = signed_in_user()
        return UserIdentity(distinct_id=user_id) if user_id else None

    _handle = posthog_instrument(
        server,
        posthog,
        MCPAnalyticsOptions(
            context=True,
            capture_model=False,
            enable_conversation_id=False,
            identify=identify,
            before_send=_before_send,
            server_build=settings().railway_git_commit_sha or None,
            logger=logger.debug,
        ),
    )


async def flush() -> None:
    """Wait for in-flight ``$mcp_tool_call`` captures. Call before the PostHog client
    shuts down (``error_tracking.shutdown``)."""
    if _handle is not None:
        await _handle.flush()
