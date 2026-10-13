"""Clerk stand-ins for tests: a local RSA key for session tokens and a fake Backend API
for OAuth access tokens."""

from __future__ import annotations

import json
import time
from functools import cache

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth import clerk
from app.db.scenarios import MemoryStore, set_store
from app.mcp import oauth

ISSUER = "https://clerk.example.test"
USER = "user_alice"
OTHER_USER = "user_bob"


@cache
def _key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def public_pem() -> str:
    return (
        _key()
        .public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )


def session_token(
    user_id: str = USER, *, azp: str | None = "http://localhost:3000", expires_in: int = 60
) -> str:
    now = int(time.time())
    claims = {"sub": user_id, "iat": now, "nbf": now, "exp": now + expires_in, "iss": ISSUER}
    if azp is not None:
        claims["azp"] = azp
    return jwt.encode(claims, _key(), algorithm="RS256", headers={"kid": "test"})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# OAuth access tokens the fake Backend API accepts, by token.
OAUTH_TOKENS = {
    "oat_alice": {
        "object": "clerk_idp_oauth_access_token",
        "id": "oat_1",
        "client_id": "client_claude",
        "subject": USER,
        "scopes": ["profile", "email"],
        "revoked": False,
        "expired": False,
        "expiration": None,
    },
    "oat_revoked": {
        "object": "clerk_idp_oauth_access_token",
        "id": "oat_2",
        "client_id": "client_claude",
        "subject": USER,
        "scopes": [],
        "revoked": True,
        "expired": False,
        "expiration": None,
    },
}


def fake_backend_api(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth_applications/access_tokens/verify"):
        if request.headers.get("authorization") != "Bearer sk_test_secret":
            return httpx.Response(401, json={"errors": []})
        token = json.loads(request.content)["access_token"]
        if token in OAUTH_TOKENS:
            return httpx.Response(200, json=OAUTH_TOKENS[token])
        return httpx.Response(404, json={"errors": [{"code": "resource_not_found"}]})
    if request.url.path.endswith("/.well-known/oauth-authorization-server"):
        return httpx.Response(200, json={"issuer": ISSUER, "registration_endpoint": "x"})
    if request.url.path.endswith("/.well-known/openid-configuration"):
        return httpx.Response(200, json={"issuer": ISSUER, "jwks_uri": "y"})
    return httpx.Response(404)


@pytest.fixture
def clerk_env(monkeypatch):
    """Accounts on: session tokens verify against the local key, OAuth tokens against the
    fake Backend API."""
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_secret")
    monkeypatch.setenv("CLERK_JWT_KEY", public_pem())
    monkeypatch.setenv("CLERK_ISSUER_URL", ISSUER)
    monkeypatch.setenv("CLERK_API_URL", "https://api.clerk.test/v1")
    real_client = httpx.AsyncClient

    def client(*args, **kwargs):
        # Calls Clerk would get (no transport given) go to the fake; test clients that
        # bring their own transport are left alone.
        kwargs.setdefault("transport", httpx.MockTransport(fake_backend_api))
        return real_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    oauth._metadata_cache.clear()
    clerk.grant_cache.clear()
    yield
    clerk.grant_cache.clear()


@pytest.fixture
def memory_store():
    store = MemoryStore()
    set_store(store)
    yield store
    set_store(None)


class AnalyticsRecorder:
    """Stands in for the PostHog client: keeps captured events."""

    def __init__(self):
        self.events = []

    def capture(self, event, *, distinct_id, properties):
        self.events.append({"event": event, "distinct_id": distinct_id, **properties})


@pytest.fixture
def posthog():
    from app import analytics

    recorder = AnalyticsRecorder()
    analytics.set_client(recorder)
    yield recorder
    analytics.set_client(None)
