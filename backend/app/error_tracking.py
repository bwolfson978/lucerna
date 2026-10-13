"""PostHog error tracking for the API.

Configured by ``POSTHOG_PROJECT_TOKEN`` (the same public project token the web app
uses) and optionally ``POSTHOG_HOST``. Without a token every function here is a no-op,
so local development and tests send nothing.

Uncaught exceptions in background threads and the interpreter are captured by the
SDK's autocapture hooks. Exceptions inside requests never reach those hooks (Starlette
turns them into a 500), so ``register`` adds a handler that reports them, and code that
catches and recovers from a failure it still wants to hear about calls
``capture_exception``.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from posthog import Posthog

logger = logging.getLogger(__name__)

DEFAULT_HOST = "https://us.i.posthog.com"

_client: Posthog | None = None


def init() -> Posthog | None:
    """Create the PostHog client once, if a project token is configured."""
    global _client
    token = os.environ.get("POSTHOG_PROJECT_TOKEN", "").strip()
    if _client is None and token:
        _client = Posthog(
            token,
            host=os.environ.get("POSTHOG_HOST") or DEFAULT_HOST,
            enable_exception_autocapture=True,
            in_app_modules=["app"],
            super_properties={
                "service": "lucerna-api",
                "environment": os.environ.get("RAILWAY_ENVIRONMENT_NAME", "local"),
            },
        )
    return _client


def capture_exception(exc: BaseException, **properties) -> None:
    """Report a handled exception. Never raises: reporting must not break the request."""
    if _client is None:
        return
    try:
        _client.capture_exception(exc, properties=properties or None)
    except Exception:  # noqa: BLE001
        logger.warning("Could not report an exception to PostHog", exc_info=True)


def shutdown() -> None:
    """Send anything still queued. Called when the app stops."""
    global _client
    if _client is not None:
        _client.shutdown()
        _client = None


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    capture_exception(exc, path=request.url.path, method=request.method)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


def register(app: FastAPI) -> None:
    init()
    app.add_exception_handler(Exception, _unhandled)
