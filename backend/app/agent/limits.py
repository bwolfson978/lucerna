"""Usage limits for the conversational agent.

Three guards, all in process memory (the backend runs as a single instance):
- messages per conversation (counted from the history the client sends),
- messages per client IP per day,
- estimated model spend per day across everyone.

Spend is only known after each model call, so admitting a message reserves a
whole turn's worst-case cost up front. A message is admitted only if recorded
spend plus every reservation still held fits under the cap, so turns in flight
together cannot overshoot it (formal/tla/AgentSpend.tla, SpendWithinCap).

Hitting any of them leaves the user's scenario intact, to edit and run without the assistant.
"""

from __future__ import annotations

import datetime
import threading
import time
from dataclasses import dataclass

from app.config import settings

# Per million tokens. Keep in sync with the model in app.agent.config.
_PRICES_PER_MTOK = {
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-opus-5-5": {"input": 4.00, "output": 20.00, "cache_read": 0.20, "cache_write": 5.00},
}
_FALLBACK_PRICE = {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write": 6.25}

# Upper bound on input tokens in one model call, for the per-turn reservation.
_MAX_INPUT_TOKENS_PER_CALL = 200_000
# A turn's reservation lapses after this long even if release() never ran (a
# client that disconnects before its stream starts), so a lost turn cannot pin
# the cap for the rest of the day. Longer than any turn can run.
_RESERVATION_TTL_S = 60 * 60


@dataclass(frozen=True)
class LimitConfig:
    messages_per_conversation: int
    messages_per_ip_per_day: int
    daily_spend_usd: float
    turn_reserve_usd: float = 0.0  # held from admission until the turn ends

    @classmethod
    def from_env(cls) -> LimitConfig:
        config = settings()
        return cls(
            messages_per_conversation=config.agent_messages_per_conversation,
            messages_per_ip_per_day=config.agent_messages_per_ip_per_day,
            daily_spend_usd=config.agent_daily_spend_usd,
            turn_reserve_usd=worst_case_turn_cost(config.agent_model),
        )


def prices_per_mtok(model: str) -> dict[str, float]:
    return _PRICES_PER_MTOK.get(model, _FALLBACK_PRICE)


def estimate_cost(model: str, usage: object) -> float:
    price = prices_per_mtok(model)

    def tokens(name: str) -> int:
        value = getattr(usage, name, None)
        if value is None and isinstance(usage, dict):
            value = usage.get(name)
        return int(value or 0)

    return (
        tokens("input_tokens") * price["input"]
        + tokens("output_tokens") * price["output"]
        + tokens("cache_read_input_tokens") * price["cache_read"]
        + tokens("cache_creation_input_tokens") * price["cache_write"]
    ) / 1_000_000


def worst_case_turn_cost(model: str) -> float:
    from app.agent.loop import MAX_MODEL_CALLS_PER_TURN
    from app.agent.model import MAX_TOKENS

    per_call = estimate_cost(
        model, {"input_tokens": _MAX_INPUT_TOKENS_PER_CALL, "output_tokens": MAX_TOKENS}
    )
    return MAX_MODEL_CALLS_PER_TURN * per_call


class Turn:
    """An admitted message: its spend draws down its reservation first."""

    def __init__(self, limiter: UsageLimiter, held: float):
        self._limiter = limiter
        self._held = held
        self.admitted_at = time.monotonic()

    def record_spend(self, usd: float) -> None:
        with self._limiter._lock:
            self._limiter._roll_day()
            self._limiter._spend += usd
            self._held = max(0.0, self._held - usd)

    def release(self) -> None:
        """Return what the turn did not spend. Safe to call more than once."""
        with self._limiter._lock:
            self._held = 0.0
            self._limiter._turns.discard(self)


class UsageLimiter:
    def __init__(self, config: LimitConfig | None = None):
        self._config = config  # read lazily: the turn reserve imports the agent loop
        self._lock = threading.Lock()
        self._day = datetime.date.today()
        self._ip_counts: dict[str, int] = {}
        self._spend = 0.0
        self._turns: set[Turn] = set()  # admitted and not yet released

    @property
    def config(self) -> LimitConfig:
        if self._config is None:
            self._config = LimitConfig.from_env()
        return self._config

    @config.setter
    def config(self, value: LimitConfig) -> None:
        self._config = value

    def _roll_day(self) -> None:
        today = datetime.date.today()
        if today != self._day:
            self._day = today
            self._ip_counts.clear()
            self._spend = 0.0
            self._turns.clear()  # yesterday's turns spend on today without holding it

    def _reserved(self) -> float:
        cutoff = time.monotonic() - _RESERVATION_TTL_S
        self._turns = {t for t in self._turns if t.admitted_at > cutoff}
        return sum(t._held for t in self._turns)

    def check(self, ip: str, conversation_messages: int) -> str | Turn:
        """Return a limit code if this message must be refused, else admit it.

        The caller records the turn's spend on the returned Turn and releases it
        when the turn ends.
        """
        with self._lock:
            self._roll_day()
            if conversation_messages >= self.config.messages_per_conversation:
                return "conversation_limit"
            if self._ip_counts.get(ip, 0) >= self.config.messages_per_ip_per_day:
                return "daily_limit"
            reserve = self.config.turn_reserve_usd
            cap = self.config.daily_spend_usd
            if self._spend >= cap or self._spend + self._reserved() + reserve > cap:
                return "unavailable"
            self._ip_counts[ip] = self._ip_counts.get(ip, 0) + 1
            turn = Turn(self, reserve)
            self._turns.add(turn)
            return turn

    def record_spend(self, usd: float) -> None:
        """Record spend that belongs to no admitted turn."""
        with self._lock:
            self._roll_day()
            self._spend += usd

    @property
    def spend_today(self) -> float:
        return self._spend

    @property
    def reserved_today(self) -> float:
        with self._lock:
            return self._reserved()

    def reset(self) -> None:
        with self._lock:
            self._ip_counts.clear()
            self._spend = 0.0
            self._turns.clear()


limiter = UsageLimiter()
