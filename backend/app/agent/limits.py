"""Usage limits for the conversational agent.

Three guards, all in process memory (the backend runs as a single instance):
- messages per conversation (counted from the history the client sends),
- messages per client IP per day,
- estimated model spend per day across everyone.

Hitting any of them sends the user to the form with their scenario intact.
"""

from __future__ import annotations

import datetime
import os
import threading
from dataclasses import dataclass

# Per million tokens. Keep in sync with the model in app.agent.config.
_PRICES_PER_MTOK = {
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-opus-5-5": {"input": 4.00, "output": 20.00, "cache_read": 0.20, "cache_write": 5.00},
}
_FALLBACK_PRICE = {"input": 5.00, "output": 25.00, "cache_read": 0.50, "cache_write": 6.25}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class LimitConfig:
    messages_per_conversation: int
    messages_per_ip_per_day: int
    daily_spend_usd: float

    @classmethod
    def from_env(cls) -> LimitConfig:
        return cls(
            messages_per_conversation=_env_int("AGENT_MESSAGES_PER_CONVERSATION", 20),
            messages_per_ip_per_day=_env_int("AGENT_MESSAGES_PER_IP_PER_DAY", 60),
            daily_spend_usd=_env_float("AGENT_DAILY_SPEND_USD", 50.0),
        )


def estimate_cost(model: str, usage: object) -> float:
    price = _PRICES_PER_MTOK.get(model, _FALLBACK_PRICE)

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


class UsageLimiter:
    def __init__(self, config: LimitConfig | None = None):
        self.config = config or LimitConfig.from_env()
        self._lock = threading.Lock()
        self._day = datetime.date.today()
        self._ip_counts: dict[str, int] = {}
        self._spend = 0.0

    def _roll_day(self) -> None:
        today = datetime.date.today()
        if today != self._day:
            self._day = today
            self._ip_counts.clear()
            self._spend = 0.0

    def check(self, ip: str, conversation_messages: int) -> str | None:
        """Return a limit code if this message must be refused, else record it."""
        with self._lock:
            self._roll_day()
            if conversation_messages >= self.config.messages_per_conversation:
                return "conversation_limit"
            if self._ip_counts.get(ip, 0) >= self.config.messages_per_ip_per_day:
                return "daily_limit"
            if self._spend >= self.config.daily_spend_usd:
                return "unavailable"
            self._ip_counts[ip] = self._ip_counts.get(ip, 0) + 1
            return None

    def record_spend(self, usd: float) -> None:
        with self._lock:
            self._roll_day()
            self._spend += usd

    @property
    def spend_today(self) -> float:
        return self._spend

    def reset(self) -> None:
        with self._lock:
            self._ip_counts.clear()
            self._spend = 0.0


limiter = UsageLimiter()
