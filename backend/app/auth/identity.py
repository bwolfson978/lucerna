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
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.clerk import AuthError, auth_enabled, verify_session_token

# Where the /mcp guard records the verified user on the ASGI scope.
USER_SCOPE_KEY = "lucerna.user_id"

_current_user: ContextVar[str | None] = ContextVar("lucerna_user_id", default=None)

_bearer = HTTPBearer(auto_error=False)


@contextmanager
def acting_as(user_id: str | None) -> Iterator[None]:
    """Run the enclosed code (and tasks it starts) as ``user_id``."""
    token = _current_user.set(user_id)
    try:
        yield
    finally:
        _current_user.reset(token)


def current_user() -> str | None:
    return _current_user.get()


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
