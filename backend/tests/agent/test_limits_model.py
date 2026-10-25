"""Bug found by model checking the assistant's spend cap (formal/tla/AgentSpend.tla)."""

import pytest

from app.agent.limits import LimitConfig, UsageLimiter


@pytest.mark.xfail(
    strict=True,
    reason="AgentSpend SpendWithinOneMessage: check() admits "
    "every message while recorded spend is under the cap, so turns in "
    "flight together overshoot it by all of their costs",
)
def test_turns_in_flight_together_overshoot_the_cap_by_at_most_one_turn():
    limiter = UsageLimiter(
        LimitConfig(messages_per_conversation=50, messages_per_ip_per_day=50, daily_spend_usd=1.0)
    )
    turn_cost = 0.6
    admitted = [limiter.check(f"ip:{n}", 0) is None for n in range(5)]
    for ok in admitted:
        if ok:
            limiter.record_spend(turn_cost)
    assert limiter.spend_today <= 1.0 + turn_cost
