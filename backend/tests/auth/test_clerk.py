"""Clerk token checks: web session tokens and MCP OAuth access tokens."""

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import clerk
from app.auth.identity import (
    USER_SCOPE_KEY,
    acting_as,
    current_user,
    optional_user,
    require_user,
    user_for_tool,
)
from tests.auth_support import OTHER_USER, USER, session_token


def creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_accounts_are_off_without_keys(monkeypatch):
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.delenv("CLERK_ISSUER_URL", raising=False)
    assert not clerk.auth_enabled()
    assert not clerk.oauth_enabled()
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk")
    assert clerk.auth_enabled() and not clerk.oauth_enabled()


async def test_session_token_gives_the_user(clerk_env):
    assert await clerk.verify_session_token(session_token(OTHER_USER)) == OTHER_USER
    # Preview deployments and the production site are our own origins too.
    token = session_token(azp="https://rothconversionsoptimizer.com")
    assert await clerk.verify_session_token(token) == USER


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(lambda: session_token(expires_in=-120), id="expired"),
        pytest.param(lambda: session_token(azp="https://evil.example"), id="other-site"),
        pytest.param(lambda: session_token("org_123"), id="not-a-user"),
        pytest.param(lambda: "not-a-jwt", id="garbage"),
        pytest.param(lambda: "oat_alice", id="oauth-token-as-session"),
    ],
)
async def test_bad_session_tokens_are_rejected(clerk_env, token):
    with pytest.raises(clerk.AuthError):
        await clerk.verify_session_token(token())


async def test_session_token_signed_by_another_key_is_rejected(clerk_env, monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    other = rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key()
    pem = other.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    monkeypatch.setenv("CLERK_JWT_KEY", pem)
    with pytest.raises(clerk.AuthError):
        await clerk.verify_session_token(session_token())


async def test_identity_dependencies(clerk_env, monkeypatch):
    assert await optional_user(None) is None
    assert await optional_user(creds(session_token())) == USER
    # A stale token is treated as signed out where an account is optional...
    assert await optional_user(creds(session_token(expires_in=-120))) is None
    # ...and as an error where it's required.
    with pytest.raises(HTTPException) as err:
        await require_user(creds(session_token(expires_in=-120)))
    assert err.value.status_code == 401
    with pytest.raises(HTTPException) as err:
        await require_user(None)
    assert err.value.status_code == 401
    assert await require_user(creds(session_token())) == USER

    monkeypatch.delenv("CLERK_SECRET_KEY")
    assert await optional_user(creds(session_token())) is None
    with pytest.raises(HTTPException) as err:
        await require_user(creds(session_token()))
    assert err.value.status_code == 503


async def test_oauth_token_verified_with_clerk_and_cached(clerk_env, monkeypatch):
    grant = await clerk.verify_oauth_token("oat_alice")
    assert grant.user_id == USER
    assert grant.client_id == "client_claude"
    assert grant.scopes == ("profile", "email")

    # Cached: a second check doesn't call Clerk.
    def fail(*args, **kwargs):
        raise AssertionError("called Clerk again")

    monkeypatch.setattr(clerk.httpx, "AsyncClient", fail)
    assert (await clerk.verify_oauth_token("oat_alice")).user_id == USER


@pytest.mark.parametrize("token", ["oat_revoked", "oat_unknown"])
async def test_bad_oauth_tokens_are_rejected(clerk_env, token):
    with pytest.raises(clerk.AuthError):
        await clerk.verify_oauth_token(token)


async def test_expired_oauth_token_is_rejected(clerk_env, monkeypatch):
    from tests import auth_support

    monkeypatch.setitem(
        auth_support.OAUTH_TOKENS,
        "oat_old",
        {**auth_support.OAUTH_TOKENS["oat_alice"], "expiration": 1_000_000_000_000},
    )
    with pytest.raises(clerk.AuthError):
        await clerk.verify_oauth_token("oat_old")


async def test_oauth_needs_the_issuer(clerk_env, monkeypatch):
    monkeypatch.delenv("CLERK_ISSUER_URL")
    with pytest.raises(clerk.AuthError):
        await clerk.verify_oauth_token("oat_alice")


def test_user_for_tool_prefers_the_http_request():
    class Request:
        scope = {USER_SCOPE_KEY: "user_http"}

    class RequestContext:
        request = Request()

    class Ctx:
        request_context = RequestContext()

    with acting_as("user_local"):
        assert current_user() == "user_local"
        assert user_for_tool(Ctx()) == "user_http"
        assert user_for_tool(None) == "user_local"
    assert current_user() is None
    assert user_for_tool(None) is None
