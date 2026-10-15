"""Usage limits for the MCP tools.

Only fresh optimizer runs count: building a scenario, looking up brackets or
methodology, and re-running a scenario whose result is cached are free, so a
first try never stops halfway through gathering inputs. Three guards, all in
process memory (the backend runs as a single instance):

- fresh analyses per caller per day (anonymous callers by IP, signed-in callers
  by user id, with a higher allowance),
- fresh analyses per day across all anonymous callers, so a spike or a script
  can't use up the server,
- analyses running at once, so one burst can't slow the site for everyone.

Days roll over at midnight UTC.
"""

from __future__ import annotations

import contextvars
import datetime
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import anyio
from starlette.requests import Request

from app.config import settings

# Who is calling: "ip:<address>" or "user:<id>". Set per request by the /mcp route and
# the web app's View broker. None means a trusted in-process caller (the web assistant,
# already limited at /api/agent): it skips the daily limits but not the concurrency cap.
current_caller: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "mcp_caller", default=None
)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@dataclass(frozen=True)
class AnalysisLimits:
    per_anonymous_caller_per_day: int
    per_user_per_day: int
    anonymous_per_day: int
    max_concurrent: int
    queue_seconds: float

    @classmethod
    def from_env(cls) -> AnalysisLimits:
        config = settings()
        return cls(
            per_anonymous_caller_per_day=config.mcp_analyses_per_ip_per_day,
            per_user_per_day=config.mcp_analyses_per_user_per_day,
            anonymous_per_day=config.mcp_anonymous_analyses_per_day,
            max_concurrent=max(1, config.mcp_max_concurrent_analyses),
            queue_seconds=config.mcp_analysis_queue_seconds,
        )


class LimitReached(Exception):
    """An analysis was refused. ``code`` is "daily_limit", "capacity" or "busy"."""

    def __init__(self, code: str, limit: int | None = None):
        super().__init__(code)
        self.code = code
        self.limit = limit


def _today() -> datetime.date:
    return datetime.datetime.now(datetime.UTC).date()


def next_reset() -> datetime.datetime:
    """When the daily limits reset: the next midnight UTC."""
    return datetime.datetime.combine(_today(), datetime.time(), datetime.UTC) + datetime.timedelta(
        days=1
    )


def is_signed_in(caller: str | None) -> bool:
    return bool(caller) and caller.startswith("user:")


class AnalysisLimiter:
    def __init__(self, limits: AnalysisLimits | None = None):
        self.limits = limits or AnalysisLimits.from_env()
        self._lock = threading.Lock()
        self._day = _today()
        self._counts: dict[str, int] = {}
        self._anonymous_total = 0
        self._slots: anyio.Semaphore | None = None

    def _roll_day(self) -> None:
        today = _today()
        if today != self._day:
            self._day = today
            self._counts.clear()
            self._anonymous_total = 0

    def charge(self, caller: str | None, runs: int) -> None:
        """Count ``runs`` fresh analyses for ``caller``, or raise LimitReached."""
        if caller is None or runs <= 0:
            return
        signed_in = is_signed_in(caller)
        allowance = (
            self.limits.per_user_per_day if signed_in else self.limits.per_anonymous_caller_per_day
        )
        with self._lock:
            self._roll_day()
            used = self._counts.get(caller, 0)
            if used + runs > allowance:
                raise LimitReached("daily_limit", allowance)
            if not signed_in and self._anonymous_total + runs > self.limits.anonymous_per_day:
                raise LimitReached("capacity")
            self._counts[caller] = used + runs
            if not signed_in:
                self._anonymous_total += runs

    def refund(self, caller: str | None, runs: int) -> None:
        if caller is None or runs <= 0:
            return
        with self._lock:
            if caller in self._counts:
                self._counts[caller] = max(0, self._counts[caller] - runs)
            if not is_signed_in(caller):
                self._anonymous_total = max(0, self._anonymous_total - runs)

    @asynccontextmanager
    async def admit(self, caller: str | None, runs: int) -> AsyncIterator[None]:
        """Charge ``runs`` fresh analyses and hold a running slot while they compute."""
        if runs <= 0:
            yield
            return
        self.charge(caller, runs)
        if self._slots is None:
            self._slots = anyio.Semaphore(self.limits.max_concurrent)
        slots = self._slots
        try:
            with anyio.fail_after(self.limits.queue_seconds):
                await slots.acquire()
        except TimeoutError:
            self.refund(caller, runs)
            raise LimitReached("busy") from None
        try:
            yield
        finally:
            slots.release()

    def reset(self) -> None:
        with self._lock:
            self._day = _today()
            self._counts.clear()
            self._anonymous_total = 0
        self._slots = None
