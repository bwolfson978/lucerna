"""OAuth discovery for /mcp. Clerk is the authorization server; this backend is the
resource server.

An MCP client (Claude, ChatGPT) that gets a 401 from /mcp reads the protected
resource metadata (RFC 9728) named in the ``WWW-Authenticate`` header, finds Clerk in
``authorization_servers``, registers itself with Clerk (Client ID Metadata Document
or dynamic client registration), sends the user to sign in, and comes back with an
access token that ``app.auth.clerk.verify_oauth_token`` checks on each request.

Clients written against the 2025-03-26 spec look for the authorization server's
metadata on this origin instead, so it's passed through from Clerk.

Environment: ``CLERK_ISSUER_URL`` (see ``app.auth.clerk``), ``MCP_RESOURCE_URL`` (the
public URL of /mcp; derived from the request when unset) and ``MCP_OAUTH_SCOPES``
(space-separated, default ``profile email``).
"""

from __future__ import annotations

import os
import time
from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.auth.clerk import issuer_url, oauth_enabled

router = APIRouter(include_in_schema=False)

RESOURCE_NAME = "Roth Conversions Optimizer"
PRM_PATH = "/.well-known/oauth-protected-resource"


def _origin(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return f"{proto}://{host.split(',')[0].strip()}"


def resource_url(request: Request) -> str:
    configured = os.environ.get("MCP_RESOURCE_URL", "").strip().rstrip("/")
    return configured or f"{_origin(request)}/mcp"


def resource_metadata_url(request: Request) -> str:
    parts = urlsplit(resource_url(request))
    # RFC 9728: the well-known segment goes between the host and the resource's path.
    return f"{parts.scheme}://{parts.netloc}{PRM_PATH}{parts.path.rstrip('/')}"


def scopes() -> list[str]:
    return os.environ.get("MCP_OAUTH_SCOPES", "profile email").split()


def _require_oauth() -> None:
    if not oauth_enabled():
        raise HTTPException(status_code=404)


@router.get(PRM_PATH)
@router.get(f"{PRM_PATH}/mcp")
async def protected_resource_metadata(request: Request):
    _require_oauth()
    return JSONResponse(
        {
            "resource": resource_url(request),
            "authorization_servers": [issuer_url()],
            "scopes_supported": scopes(),
            "bearer_methods_supported": ["header"],
            "resource_name": RESOURCE_NAME,
            "resource_documentation": "https://rothconversionsoptimizer.com/methodology",
        },
        headers={"Cache-Control": "public, max-age=3600"},
    )


# --------------------------------------------------------------------------
# Authorization server metadata, passed through from Clerk
# --------------------------------------------------------------------------

_CACHE_SECONDS = 3600
_metadata_cache: dict[str, tuple[float, dict]] = {}


async def _clerk_metadata(document: str) -> dict:
    url = f"{issuer_url()}/.well-known/{document}"
    cached = _metadata_cache.get(url)
    if cached and cached[0] > time.time():
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as err:
        raise HTTPException(status_code=502, detail="Authorization server unavailable.") from err
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Authorization server unavailable.")
    _metadata_cache[url] = (time.time() + _CACHE_SECONDS, data)
    return data


@router.get("/.well-known/oauth-authorization-server")
@router.get("/.well-known/oauth-authorization-server/mcp")
async def authorization_server_metadata():
    _require_oauth()
    return JSONResponse(
        await _clerk_metadata("oauth-authorization-server"),
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/.well-known/openid-configuration")
async def openid_configuration():
    _require_oauth()
    return JSONResponse(
        await _clerk_metadata("openid-configuration"),
        headers={"Cache-Control": "public, max-age=3600"},
    )
