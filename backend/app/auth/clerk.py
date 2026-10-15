"""Clerk JWT verification — extracts clerk_user_id from Bearer tokens."""

import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings

_bearer = HTTPBearer(auto_error=False)
_jwks_clients: dict[str, PyJWKClient] | None = None

_JWKS_SUFFIX = "/.well-known/jwks.json"


def _get_jwks_clients() -> dict[str, PyJWKClient]:
    """Public keys of each accepted Clerk instance, keyed by token issuer.

    CLERK_JWKS_URL is a comma-separated list of Frontend API JWKS URLs, e.g. the
    development instance (https://<app>.clerk.accounts.dev/.well-known/jwks.json)
    for preview builds and the production one for the live site. A token's `iss` is
    its instance's Frontend API URL, which picks the keys to verify it with.
    (api.clerk.com/v1/jwks needs the secret key, so it can't be used unauthenticated.)
    """
    global _jwks_clients
    if _jwks_clients is None:
        urls = settings().clerk_jwks_urls
        _jwks_clients = {
            url.removesuffix(_JWKS_SUFFIX): PyJWKClient(url, cache_keys=True) for url in urls
        }
    if not _jwks_clients:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is not configured",
        )
    return _jwks_clients


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> str:
    """FastAPI dependency that validates a Clerk JWT and returns the clerk_user_id."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token = credentials.credentials
    try:
        clients = _get_jwks_clients()
        issuer = jwt.decode(token, options={"verify_signature": False}).get("iss")
        client = clients.get(issuer)
        if client is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: unknown issuer",
            )
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing sub claim",
            )
        return user_id
    except jwt.ExpiredSignatureError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        ) from err
    except HTTPException:
        raise
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from err
