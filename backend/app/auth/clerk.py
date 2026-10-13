"""Clerk: who is signed in.

Two kinds of bearer token reach the backend:
- session tokens, short-lived JWTs the web app gets from Clerk for a signed-in
  visitor (``Authorization: Bearer <token>`` on /api calls);
- OAuth access tokens, which MCP clients (Claude, ChatGPT) get from Clerk's OAuth
  server after the user signs in, and send to /mcp.

Accounts are on only when ``CLERK_SECRET_KEY`` is set. Without it every caller is
signed out and the app behaves as it did before accounts existed.

Environment:
- ``CLERK_SECRET_KEY``: the instance's secret key (Clerk dashboard, API keys).
- ``CLERK_ISSUER_URL``: the Frontend API URL (``https://<name>.clerk.accounts.dev``
  or ``https://clerk.<domain>``). It is the OAuth authorization server for /mcp.
- ``CLERK_JWT_KEY``: optional PEM public key, to verify session tokens without
  fetching Clerk's JWKS.
- ``CLERK_API_URL``: Backend API base, ``https://api.clerk.com/v1`` by default.
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from dataclasses import dataclass

import httpx
from clerk_backend_api.security.machine import is_machine_token
from clerk_backend_api.security.types import TokenVerificationError, VerifyTokenOptions
from clerk_backend_api.security.verifytoken import verify_token_async

from app.origins import is_allowed_origin

DEFAULT_API_URL = "https://api.clerk.com/v1"


class AuthError(Exception):
    """The token is missing, invalid, expired or revoked."""


@dataclass(frozen=True)
class OAuthGrant:
    """A verified OAuth access token: the user it acts for and the client holding it."""

    user_id: str
    client_id: str
    scopes: tuple[str, ...]
    expires_at: float | None


def secret_key() -> str:
    return os.environ.get("CLERK_SECRET_KEY", "").strip()


def issuer_url() -> str:
    return os.environ.get("CLERK_ISSUER_URL", "").strip().rstrip("/")


def api_url() -> str:
    return os.environ.get("CLERK_API_URL", DEFAULT_API_URL).strip().rstrip("/")


def auth_enabled() -> bool:
    """Accounts are on: session tokens can be verified."""
    return bool(secret_key())


def oauth_enabled() -> bool:
    """/mcp requires an OAuth token: Clerk is configured as its authorization server."""
    return auth_enabled() and bool(issuer_url())


# --------------------------------------------------------------------------
# Session tokens (web app)
# --------------------------------------------------------------------------


async def verify_session_token(token: str) -> str:
    """Return the Clerk user id for a web session token, or raise AuthError."""
    if not auth_enabled():
        raise AuthError("Accounts are not configured.")
    if is_machine_token(token):
        raise AuthError("Not a session token.")
    jwt_key = os.environ.get("CLERK_JWT_KEY", "").strip() or None
    options = VerifyTokenOptions(
        secret_key=None if jwt_key else secret_key(),
        jwt_key=jwt_key,
        # The SDK appends /v1/jwks itself.
        api_url=api_url().removesuffix("/v1"),
    )
    try:
        claims = await verify_token_async(token, options)
    except TokenVerificationError as err:
        raise AuthError(str(err)) from err
    # Session tokens name the origin they were issued to. Accept only our own sites,
    # so a token minted for another app on the same Clerk instance can't be replayed.
    azp = claims.get("azp")
    if azp is not None and not is_allowed_origin(azp):
        raise AuthError("Token was issued to another site.")
    user_id = claims.get("sub")
    if not isinstance(user_id, str) or not user_id.startswith("user_"):
        raise AuthError("Token has no user.")
    return user_id


# --------------------------------------------------------------------------
# OAuth access tokens (MCP clients)
# --------------------------------------------------------------------------

_CACHE_SECONDS = 60
_CACHE_MAX = 10_000


class _GrantCache:
    """Verified grants by token hash, for a short time, so a busy MCP session doesn't
    call Clerk on every request. Revocation takes effect within the cache window."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._grants: dict[str, tuple[float, OAuthGrant]] = {}

    @staticmethod
    def key(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def get(self, token: str) -> OAuthGrant | None:
        with self._lock:
            entry = self._grants.get(self.key(token))
            if entry is None:
                return None
            until, grant = entry
            if until <= time.time():
                self._grants.pop(self.key(token), None)
                return None
            return grant

    def put(self, token: str, grant: OAuthGrant) -> None:
        until = time.time() + _CACHE_SECONDS
        if grant.expires_at is not None:
            until = min(until, grant.expires_at)
        with self._lock:
            if len(self._grants) >= _CACHE_MAX:
                self._grants.clear()
            self._grants[self.key(token)] = (until, grant)

    def clear(self) -> None:
        with self._lock:
            self._grants.clear()


grant_cache = _GrantCache()


def _expiry_seconds(value: object) -> float | None:
    if not isinstance(value, int | float) or value <= 0:
        return None
    # Clerk reports Unix time in milliseconds; tolerate seconds.
    return value / 1000 if value > 10_000_000_000 else float(value)


async def verify_oauth_token(token: str) -> OAuthGrant:
    """Verify an OAuth access token (opaque or JWT) with Clerk's Backend API."""
    if not oauth_enabled():
        raise AuthError("OAuth is not configured.")
    if cached := grant_cache.get(token):
        return cached
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{api_url()}/oauth_applications/access_tokens/verify",
                json={"access_token": token},
                headers={"Authorization": f"Bearer {secret_key()}"},
            )
    except httpx.HTTPError as err:
        raise AuthError("Couldn't reach Clerk to verify the token.") from err
    if response.status_code != 200:
        raise AuthError("Invalid access token.")
    try:
        data = response.json()
    except ValueError as err:
        raise AuthError("Invalid access token.") from err
    if not isinstance(data, dict) or data.get("active") is False:
        raise AuthError("Invalid access token.")
    if data.get("revoked") or data.get("expired"):
        raise AuthError("Access token is revoked or expired.")
    subject = data.get("subject")
    if not isinstance(subject, str) or not subject.startswith("user_"):
        raise AuthError("Access token has no user.")
    expires_at = _expiry_seconds(data.get("expiration"))
    if expires_at is not None and expires_at <= time.time():
        raise AuthError("Access token is expired.")
    grant = OAuthGrant(
        user_id=subject,
        client_id=str(data.get("client_id") or ""),
        scopes=tuple(s for s in data.get("scopes") or [] if isinstance(s, str)),
        expires_at=expires_at,
    )
    grant_cache.put(token, grant)
    return grant
