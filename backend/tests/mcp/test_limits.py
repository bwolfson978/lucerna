"""Analysis limits for the MCP tools (app.mcp.limits)."""

import datetime

import anyio
import pytest

from app.mcp.limits import AnalysisLimiter, AnalysisLimits, LimitReached, next_reset


def _limiter(**overrides) -> AnalysisLimiter:
    limits = {
        "per_anonymous_caller_per_day": 3,
        "per_user_per_day": 5,
        "anonymous_per_day": 4,
        "max_concurrent": 1,
        "queue_seconds": 0.05,
    } | overrides
    return AnalysisLimiter(AnalysisLimits(**limits))


def test_anonymous_callers_get_their_own_daily_allowance():
    limiter = _limiter()
    limiter.charge("ip:a", 2)
    limiter.charge("ip:a", 1)
    with pytest.raises(LimitReached) as err:
        limiter.charge("ip:a", 1)
    assert err.value.code == "daily_limit" and err.value.limit == 3
    limiter.charge("ip:b", 1)


def test_a_charge_that_would_cross_the_limit_is_refused_whole():
    limiter = _limiter()
    limiter.charge("ip:a", 2)
    with pytest.raises(LimitReached):
        limiter.charge("ip:a", 2)
    limiter.charge("ip:a", 1)


def test_anonymous_ceiling_spares_signed_in_users():
    limiter = _limiter()
    limiter.charge("ip:a", 3)
    limiter.charge("ip:b", 1)
    with pytest.raises(LimitReached) as err:
        limiter.charge("ip:c", 1)
    assert err.value.code == "capacity"
    limiter.charge("user:u1", 5)
    with pytest.raises(LimitReached) as err:
        limiter.charge("user:u1", 1)
    assert err.value.code == "daily_limit" and err.value.limit == 5


def test_trusted_callers_and_cached_runs_are_free():
    limiter = _limiter(per_anonymous_caller_per_day=0)
    limiter.charge(None, 50)
    limiter.charge("ip:a", 0)


def test_counts_reset_each_day():
    limiter = _limiter()
    limiter.charge("ip:a", 3)
    limiter._day -= datetime.timedelta(days=1)
    limiter.charge("ip:a", 3)


def test_next_reset_is_the_coming_midnight_utc():
    reset = next_reset()
    now = datetime.datetime.now(datetime.UTC)
    assert reset.tzinfo is not None and reset.hour == 0 and reset.minute == 0
    assert datetime.timedelta(0) < reset - now <= datetime.timedelta(days=1)


async def test_busy_when_no_slot_frees_up_and_the_charge_is_refunded():
    limiter = _limiter()
    entered = anyio.Event()
    release = anyio.Event()

    async def hold():
        async with limiter.admit("ip:a", 1):
            entered.set()
            await release.wait()

    async with anyio.create_task_group() as tg:
        tg.start_soon(hold)
        await entered.wait()
        with pytest.raises(LimitReached) as err:
            async with limiter.admit("ip:b", 1):
                pass
        assert err.value.code == "busy"
        release.set()

    # ip:b's refused run wasn't counted; a waiting run gets the freed slot.
    async with limiter.admit("ip:b", 3):
        pass


async def test_admit_without_fresh_runs_skips_the_queue():
    limiter = _limiter(per_anonymous_caller_per_day=0)
    async with limiter.admit("ip:a", 0):
        pass
