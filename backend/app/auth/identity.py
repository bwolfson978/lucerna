"""The signed-in user for a request or an MCP tool call.

Web routes read the session token with the ``optional_user`` / ``require_user``
dependencies. MCP tools call ``user_for_tool(ctx)``, which finds the user either on
the HTTP request (``/mcp``, set by the guard in ``app.mcp.server``) or, for the web
assistant's in-process MCP session, in a context variable the agent sets with
``acting_as`` before it opens the session.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.clerk import AuthError, auth_enabled, verify_session_token

# Where the /mcp guard records the verified user, and the full caller, on the ASGI scope.
USER_SCOPE_KEY = "lucerna.user_id"
CALLER_SCOPE_KEY = "lucerna.caller"


@dataclass(frozen=True)
class Caller:
    """Who a tool call is for and where it came from, for analytics.

    Set only by trusted code: the /mcp guard (from a verified token or the web
    assistant's internal secret) or the web app's own routes.
    """

    user_id: str | None = None
    # The browser's PostHog distinct id and session id (web, signed out or not).
    anonymous_id: str | None = None
    session_id: str | None = None
    # "web_assistant" for the site's own assistant; None means work it out from the client.
    channel: str | None = None
    # The OAuth client holding the access token (MCP clients).
    oauth_client_id: str | None = None


_SIGNED_OUT = Caller()
_current: ContextVar[Caller | None] = ContextVar("lucerna_caller", default=None)

_bearer = HTTPBearer(auto_error=False)


@contextmanager
def acting_as(user_id: str | None, **caller: Any) -> Iterator[None]:
    """Run the enclosed code (and tasks it starts) as ``user_id``. Extra keyword
    arguments fill in the rest of the ``Caller``."""
    token = _current.set(Caller(user_id=user_id, **caller))
    try:
        yield
    finally:
        _current.reset(token)


def current_caller() -> Caller:
    return _current.get() or _SIGNED_OUT


def current_user() -> str | None:
    return current_caller().user_id


def browser_ids(headers: Any) -> dict[str, str]:
    """The browser's PostHog distinct id and session id, sent by the website (the same
    headers posthog-js uses for tracing). For analytics only, never for access."""
    ids = {}
    for key, header in (
        ("anonymous_id", "x-posthog-distinct-id"),
        ("session_id", "x-posthog-session-id"),
    ):
        value = (headers.get(header) or "").strip()
        if value and len(value) <= 200 and value.isprintable():
            ids[key] = value
    return ids


def user_for_tool(ctx: Any) -> str | None:
    """The user an MCP tool call acts for, or None when signed out."""
    request = None
    if ctx is not None:
        try:
            request = ctx.request_context.request
        except (AttributeError, LookupError, ValueError):
            request = None
    scope = getattr(request, "scope", None)
    if isinstance(scope, dict):
        return scope.get(USER_SCOPE_KEY)
    return current_user()


async def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    """The signed-in user, or None. An invalid or expired token counts as signed out,
    so a stale tab never loses access to what works without an account."""
    if credentials is None or not auth_enabled():
        return None
    try:
        return await verify_session_token(credentials.credentials)
    except AuthError:
        return None


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if not auth_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Accounts aren't available right now.",
        )
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in first.")
    try:
        return await verify_session_token(credentials.credentials)
    except AuthError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in again."
        ) from err
