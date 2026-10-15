"""Sign-in for the MCP server, with Clerk as the OAuth authorization server.

Most tools are open to anyone. The account tools (ACCOUNT_TOOLS) need the user's
Lucerna account, and sign-in is asked for lazily: when a client calls one without a
valid token, the /mcp route answers HTTP 401 with a WWW-Authenticate challenge that
points at this server's protected resource metadata. Claude shows a Connect card and
retries the call after sign-in; other spec-following clients start their OAuth flow
the same way. Tokens are Clerk OAuth access tokens (JWTs), verified offline against
the instance's public keys.

Set MCP_AUTH_ISSUER to the Clerk instance's Frontend API URL (the production instance
for the live server) to turn sign-in on. Without it the account tools say saving isn't
available and nothing else changes.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import jwt
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from jwt import PyJWKClient

from app.config import settings

ACCOUNT_TOOLS = frozenset({"save_scenario", "list_saved_scenarios", "open_saved_scenario"})

RESOURCE_NAME = "Roth Conversions Optimizer"
MCP_PATH = "/mcp"
METADATA_PATH = "/.well-known/oauth-protected-resource"

_jwks_clients: dict[str, PyJWKClient] = {}
_as_metadata: dict[str, tuple[float, dict[str, Any]]] = {}
_AS_METADATA_TTL = 3600.0


def auth_issuer() -> str | None:
    return settings().mcp_auth_issuer.rstrip("/") or None


def auth_scopes() -> list[str]:
    return settings().mcp_auth_scopes.split()


def base_url(request: Request) -> str:
    """This server's public origin as the client sees it (behind Railway's proxy)."""
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return f"{proto}://{host.split(',')[0].strip()}"


def resource_metadata_url(request: Request) -> str:
    return f"{base_url(request)}{METADATA_PATH}{MCP_PATH}"


def www_authenticate(request: Request, *, invalid_token: bool = False) -> str:
    parts = []
    if invalid_token:
        parts += ['error="invalid_token"', 'error_description="Sign in again"']
    parts += [
        f'resource_metadata="{resource_metadata_url(request)}"',
        f'scope="{" ".join(auth_scopes())}"',
    ]
    return "Bearer " + ", ".join(parts)


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def verify_access_token(token: str) -> str | None:
    """The Clerk user id a valid access token belongs to, else None.

    Checks the signature against the issuer's JWKS, the issuer and expiry. Blocking (it
    may fetch the JWKS), so call it from a worker thread.
    """
    issuer = auth_issuer()
    if issuer is None:
        return None
    client = _jwks_clients.get(issuer)
    if client is None:
        client = _jwks_clients[issuer] = PyJWKClient(
            f"{issuer}/.well-known/jwks.json", cache_keys=True
        )
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False, "require": ["exp", "sub", "iss"]},
        )
    except (jwt.PyJWTError, OSError):
        return None
    user_id = payload.get("sub")
    return user_id if isinstance(user_id, str) and user_id else None


def calls_account_tool(message: Any) -> bool:
    """True when a JSON-RPC message (or batch) calls one of the account tools."""
    messages = message if isinstance(message, list) else [message]
    for msg in messages:
        if isinstance(msg, dict) and msg.get("method") == "tools/call":
            params = msg.get("params")
            if isinstance(params, dict) and params.get("name") in ACCOUNT_TOOLS:
                return True
    return False


# --------------------------------------------------------------------------
# Discovery documents
# --------------------------------------------------------------------------

router = APIRouter()


def _require_issuer() -> str:
    issuer = auth_issuer()
    if issuer is None:
        raise HTTPException(status_code=404, detail="Sign-in is not configured")
    return issuer


@router.get(METADATA_PATH, include_in_schema=False)
@router.get(METADATA_PATH + MCP_PATH, include_in_schema=False)
async def protected_resource_metadata(request: Request):
    """RFC 9728: where clients find the authorization server for /mcp."""
    issuer = _require_issuer()
    return JSONResponse(
        {
            "resource": f"{base_url(request)}{MCP_PATH}",
            "authorization_servers": [issuer],
            "scopes_supported": auth_scopes(),
            "bearer_methods_supported": ["header"],
            "resource_name": RESOURCE_NAME,
        },
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/.well-known/oauth-authorization-server", include_in_schema=False)
async def authorization_server_metadata():
    """Clerk's RFC 8414 metadata, for clients written to older MCP drafts that look for it
    on the MCP server's own origin. Current clients read it from Clerk directly."""
    issuer = _require_issuer()
    cached = _as_metadata.get(issuer)
    if cached is None or time.monotonic() - cached[0] > _AS_METADATA_TTL:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{issuer}/.well-known/oauth-authorization-server")
                response.raise_for_status()
                cached = (time.monotonic(), response.json())
        except (httpx.HTTPError, ValueError) as err:
            if cached is None:
                raise HTTPException(status_code=502, detail="Sign-in is unavailable") from err
        else:
            _as_metadata[issuer] = cached
    return JSONResponse(cached[1], headers={"Cache-Control": "public, max-age=300"})
