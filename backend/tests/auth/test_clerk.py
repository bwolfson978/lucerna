"""Clerk token checks: each token is verified with the keys of the instance that issued it."""

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.auth import clerk

DEV = "https://lucerna.clerk.accounts.dev"
PROD = "https://clerk.example.com"


class FakeJWKClient:
    def __init__(self, url, cache_keys=True):
        self.url = url

    def get_signing_key_from_jwt(self, token):
        return SimpleNamespace(key=KEYS[self.url.removesuffix(clerk._JWKS_SUFFIX)].public_key())


KEYS = {DEV: rsa.generate_private_key(65537, 2048), PROD: rsa.generate_private_key(65537, 2048)}


def token(issuer, signer=None, **claims):
    body = {"sub": "user_123", "iss": issuer, "exp": int(time.time()) + 60, **claims}
    return jwt.encode(body, KEYS[signer or issuer], algorithm="RS256")


def creds(value):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=value)


@pytest.fixture(autouse=True)
def jwks(monkeypatch):
    monkeypatch.setattr(clerk, "PyJWKClient", FakeJWKClient)
    monkeypatch.setattr(clerk, "_jwks_clients", None)
    monkeypatch.setenv(
        "CLERK_JWKS_URL", f"{DEV}/.well-known/jwks.json, {PROD}/.well-known/jwks.json"
    )


@pytest.mark.parametrize("issuer", [DEV, PROD])
async def test_accepts_tokens_from_each_listed_instance(issuer):
    assert await clerk.get_current_user(creds(token(issuer))) == "user_123"


async def test_rejects_unlisted_issuer():
    with pytest.raises(HTTPException) as err:
        await clerk.get_current_user(creds(token("https://evil.example", signer=DEV)))
    assert err.value.status_code == 401


async def test_rejects_token_signed_by_another_instance():
    with pytest.raises(HTTPException) as err:
        await clerk.get_current_user(creds(token(PROD, signer=DEV)))
    assert err.value.status_code == 401


async def test_unconfigured_returns_503(monkeypatch):
    monkeypatch.setenv("CLERK_JWKS_URL", "")
    with pytest.raises(HTTPException) as err:
        await clerk.get_current_user(creds(token(DEV)))
    assert err.value.status_code == 503
