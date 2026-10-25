"""Bugs found by model checking the analysis limits (formal/tla/McpLimits.tla).

Each xfail test replays one TLC counterexample against the real code. They are
strict: when a fix lands the test passes, pytest reports XPASS as a failure,
and the marker comes off.
"""

import datetime

import anyio
import pytest
from starlette.requests import Request

from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.mcp import limits as limits_module
from app.mcp import server
from app.mcp.limits import AnalysisLimiter, AnalysisLimits, LimitReached, client_ip
from app.tools import core


def _limiter(**overrides) -> AnalysisLimiter:
    limits = {
        "per_anonymous_caller_per_day": 3,
        "per_user_per_day": 5,
        "anonymous_per_day": 4,
        "max_concurrent": 1,
        "queue_seconds": 0.05,
    } | overrides
    return AnalysisLimiter(AnalysisLimits(**limits))


def _scenario(income: float = 40_000) -> ScenarioInput:
    return ScenarioInput(
        age=55,
        filing_status=FilingStatus.SINGLE,
        timeline=[PlanYear(year=2026, gross_income=income)],
        traditional_ira_balance=300_000,
        drawdown_start_age=65,
        planning_horizon_age=90,
    )


@pytest.fixture
def evicted_between_check_and_run(monkeypatch):
    """The interleaving from the McpLimits counterexample: the scenario is cached when
    _run_drafts checks, and other traffic pushes it out of the LRU before it runs."""
    cache = core._ResultCache(size=1)
    monkeypatch.setattr(core, "_results", cache)
    monkeypatch.setattr(core, "scenario_input", lambda draft: draft)
    fresh_runs = []
    monkeypatch.setattr(core, "optimize", lambda scenario: fresh_runs.append(scenario) or "result")

    scenario = _scenario()
    cache.get_or_compute(scenario)
    fresh_runs.clear()

    real_is_cached = core.is_cached

    def is_cached_then_evicted(s):
        cached = real_is_cached(s)
        cache.get_or_compute(_scenario(income=99_999))  # someone else's run
        return cached

    monkeypatch.setattr(core, "is_cached", is_cached_then_evicted)
    return scenario, fresh_runs


@pytest.mark.xfail(
    strict=True,
    reason="McpLimits EveryFreshRunIsCharged: the charge is "
    "decided by is_cached() before the run, so an eviction in between "
    "gives a free optimizer run",
)
async def test_a_run_that_turns_out_fresh_is_charged(monkeypatch, evicted_between_check_and_run):
    scenario, fresh_runs = evicted_between_check_and_run
    monkeypatch.setattr(server, "_analysis_limiter", _limiter(per_anonymous_caller_per_day=0))
    token = limits_module.current_caller.set("ip:203.0.113.7")
    try:
        with pytest.raises(LimitReached):
            await server._run_drafts([scenario])
    finally:
        limits_module.current_caller.reset(token)
    assert fresh_runs == []


@pytest.mark.xfail(
    strict=True,
    reason="McpLimits FreshRunsHoldASlot: runs=0 skips the "
    "semaphore, so the same eviction runs the optimizer past the "
    "concurrency cap",
)
async def test_a_run_that_turns_out_fresh_waits_for_a_slot(
    monkeypatch, evicted_between_check_and_run
):
    scenario, fresh_runs = evicted_between_check_and_run
    limiter = _limiter(queue_seconds=0.05)
    monkeypatch.setattr(server, "_analysis_limiter", limiter)
    token = limits_module.current_caller.set("ip:203.0.113.7")
    try:
        async with limiter.admit("ip:198.51.100.1", 1):  # the only slot is taken
            with pytest.raises(LimitReached) as err:
                await server._run_drafts([scenario])
    finally:
        limits_module.current_caller.reset(token)
    assert err.value.code == "busy"
    assert fresh_runs == []


@pytest.mark.xfail(
    strict=True,
    reason="McpLimits RefundsStayOnTheirDay: refund() never "
    "rolls the day, so a timeout after midnight credits the new day",
)
def test_a_refund_after_midnight_leaves_the_new_day_alone(monkeypatch):
    day = [datetime.date(2026, 10, 24)]
    monkeypatch.setattr(limits_module, "_today", lambda: day[0])
    limiter = _limiter(anonymous_per_day=2)
    limiter.charge("ip:a", 1)  # 23:59:59, then waits in the queue
    day[0] = datetime.date(2026, 10, 25)
    limiter.charge("ip:b", 2)  # after midnight: the new day's whole ceiling
    limiter.refund("ip:a", 1)  # ip:a's wait times out
    with pytest.raises(LimitReached):
        limiter.charge("ip:c", 1)


@pytest.mark.xfail(
    strict=True,
    reason="McpLimits NoChargeWithoutARun: a client that "
    "disconnects while queued is cancelled, not timed out, and keeps "
    "its charge",
)
async def test_a_request_cancelled_in_the_queue_is_refunded():
    limiter = _limiter(per_anonymous_caller_per_day=1, queue_seconds=5)
    async with limiter.admit("ip:other", 1):
        with anyio.move_on_after(0.05):  # the client goes away while waiting
            async with limiter.admit("ip:a", 1):
                pytest.fail("should still be waiting for the slot")
    limiter.charge("ip:a", 1)  # its one analysis today was never run


def _request(forwarded_for: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/mcp",
            "headers": [(b"x-forwarded-for", forwarded_for.encode())],
            "client": ("10.0.0.2", 443),
        }
    )


@pytest.mark.xfail(
    strict=True,
    reason="AgentSpend MessagesPerClient: client_ip() takes "
    "the first X-Forwarded-For entry, which the client writes behind a "
    "proxy that appends (Railway's edge behavior is not documented)",
)
def test_a_client_cannot_pick_its_own_rate_limit_key():
    # A proxy appends the address it saw; whatever comes before is the client's text.
    real = "198.51.100.23"
    keys = {client_ip(_request(f"{fake}, {real}")) for fake in ("1.1.1.1", "2.2.2.2")}
    assert len(keys) == 1
