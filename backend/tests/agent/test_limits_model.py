"""Bug found by model checking the assistant's spend cap (formal/tla/AgentSpend.tla)."""

import datetime
import time

from app.agent.limits import LimitConfig, Turn, UsageLimiter


def test_turns_in_flight_together_stay_within_the_cap():
    turn_cost = 0.6
    limiter = UsageLimiter(
        LimitConfig(
            messages_per_conversation=50,
            messages_per_ip_per_day=50,
            daily_spend_usd=1.0,
            turn_reserve_usd=turn_cost,
        )
    )
    turns = [limiter.check(f"ip:{n}", 0) for n in range(5)]
    admitted = [t for t in turns if isinstance(t, Turn)]
    assert len(admitted) == 1
    assert turns[1:] == ["unavailable"] * 4
    for turn in admitted:
        turn.record_spend(turn_cost)
        turn.release()
    assert limiter.spend_today <= 1.0


def test_a_finished_turn_returns_what_it_did_not_spend():
    limiter = UsageLimiter(LimitConfig(50, 50, daily_spend_usd=1.0, turn_reserve_usd=0.6))
    first = limiter.check("a", 0)
    assert isinstance(first, Turn)
    assert limiter.check("b", 0) == "unavailable"
    first.record_spend(0.1)
    first.release()
    first.release()
    assert limiter.reserved_today == 0
    assert isinstance(limiter.check("b", 0), Turn)


def test_a_turn_spanning_midnight_does_not_hold_the_new_day():
    limiter = UsageLimiter(LimitConfig(50, 50, daily_spend_usd=1.0, turn_reserve_usd=0.6))
    turn = limiter.check("a", 0)
    assert isinstance(turn, Turn)
    limiter._day = datetime.date.today() - datetime.timedelta(days=1)
    assert isinstance(limiter.check("b", 0), Turn)  # rolls the day
    turn.record_spend(0.2)
    turn.release()
    assert limiter.reserved_today == 0.6
    assert limiter.spend_today == 0.2


def test_a_turn_never_released_stops_holding_after_an_hour(monkeypatch):
    limiter = UsageLimiter(LimitConfig(50, 50, daily_spend_usd=1.0, turn_reserve_usd=0.6))
    assert isinstance(limiter.check("a", 0), Turn)
    assert limiter.check("b", 0) == "unavailable"
    later = time.monotonic() + 60 * 60 + 1
    monkeypatch.setattr(time, "monotonic", lambda: later)
    assert isinstance(limiter.check("b", 0), Turn)


def test_the_reserve_covers_every_call_a_turn_can_make():
    # The model's ASSUME Reserve >= Calls * Cost: the tool loop's rounds, plus the small
    # call that writes follow-up questions, each at its largest.
    from app.agent.limits import _PRICES_PER_MTOK, estimate_cost, worst_case_turn_cost
    from app.agent.loop import MAX_MODEL_CALLS_PER_TURN
    from app.agent.model import MAX_TOKENS, TASK_MAX_TOKENS, TASK_MODEL

    assert TASK_MODEL in _PRICES_PER_MTOK  # priced at its own rate, not the fallback
    rounds = MAX_MODEL_CALLS_PER_TURN * estimate_cost(
        "claude-sonnet-5-5", {"input_tokens": 200_000, "output_tokens": MAX_TOKENS}
    )
    follow_ups = estimate_cost(
        TASK_MODEL, {"input_tokens": 100_000, "output_tokens": TASK_MAX_TOKENS}
    )
    assert follow_ups > 0
    assert abs(worst_case_turn_cost("claude-sonnet-5-5") - (rounds + follow_ups)) < 1e-9
