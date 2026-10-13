"""PostHog error tracking: unhandled request errors are reported and answered with a 500."""

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app import error_tracking


@pytest.fixture
def client_mock(monkeypatch):
    mock = MagicMock()
    monkeypatch.setattr(error_tracking, "_client", mock)
    return mock


def _app_that_fails() -> FastAPI:
    app = FastAPI()
    error_tracking.register(app)

    @app.get("/boom")
    async def boom():
        raise RuntimeError("boom")

    return app


async def test_unhandled_error_is_reported_and_returns_500(client_mock):
    transport = ASGITransport(app=_app_that_fails(), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
    exc = client_mock.capture_exception.call_args.args[0]
    assert isinstance(exc, RuntimeError)
    assert client_mock.capture_exception.call_args.kwargs["properties"] == {
        "path": "/boom",
        "method": "GET",
    }


def test_capture_is_a_no_op_without_a_token(monkeypatch):
    monkeypatch.setattr(error_tracking, "_client", None)
    monkeypatch.delenv("POSTHOG_PROJECT_TOKEN", raising=False)
    assert error_tracking.init() is None
    error_tracking.capture_exception(RuntimeError("ignored"))


def test_reporting_failures_never_raise(client_mock):
    client_mock.capture_exception.side_effect = OSError("network down")
    error_tracking.capture_exception(RuntimeError("boom"))
