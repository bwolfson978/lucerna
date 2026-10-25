"""Usage limits and the cached demo conversation."""

import datetime

from app.agent import demo
from app.agent.limits import LimitConfig, Turn, UsageLimiter, estimate_cost
from tests.agent.fakes import FunctionModelClient, text, tool_use
from tests.agent.test_loop import assert_well_formed

THIS_YEAR = datetime.date.today().year


def test_limits_per_conversation_ip_and_spend():
    limiter = UsageLimiter(
        LimitConfig(messages_per_conversation=3, messages_per_ip_per_day=2, daily_spend_usd=1.0)
    )
    assert limiter.check("a", 3) == "conversation_limit"
    assert isinstance(limiter.check("a", 0), Turn)
    assert isinstance(limiter.check("a", 0), Turn)
    assert limiter.check("a", 0) == "daily_limit"
    assert isinstance(limiter.check("b", 0), Turn)
    limiter.record_spend(1.5)
    assert limiter.check("c", 0) == "unavailable"


def test_limits_reset_each_day():
    limiter = UsageLimiter(LimitConfig(5, 1, 1.0))
    assert isinstance(limiter.check("a", 0), Turn)
    assert limiter.check("a", 0) == "daily_limit"
    limiter._day = datetime.date.today() - datetime.timedelta(days=1)
    assert isinstance(limiter.check("a", 0), Turn)


def test_estimate_cost():
    usage = {"input_tokens": 1_000_000, "output_tokens": 100_000, "cache_read_input_tokens": 0}
    assert estimate_cost("claude-sonnet-5-5", usage) == 2.0 + 1.0
    assert estimate_cost("unknown-model", {"output_tokens": 0}) == 0


async def test_scripted_demo_is_valid_history_with_engine_numbers():
    conversation = await demo.generate_scripted()
    assert conversation["source"] == "scripted"
    assert [e["user"] for e in conversation["exchanges"]] == list(demo.DEMO_MESSAGES)
    assert_well_formed(conversation["messages"])
    events = conversation["exchanges"][1]["events"]
    result = next(e for e in events if e["type"] == "result")
    savings = result["result"]["estimated_lifetime_tax_savings"]
    explanation = next(e for e in events if e["type"] == "text_delta")["text"]
    assert f"${round(savings):,}" in explanation
    assert "—" not in explanation
    assert conversation["draft"]["age"] == 63


SCENARIO = {
    "birth_year": THIS_YEAR - 63,
    "birth_month": 6,
    "filing_status": "married_filing_jointly",
    "spouse_birth_year": THIS_YEAR - 52,
    "spouse_birth_month": 3,
    "current_income": 20000,
    "traditional_balance": 1400000,
    "retirement_age": 73,
}


async def test_agent_generated_demo(monkeypatch):
    """The real loop drives the demo when a model is available."""

    def respond(messages):
        last = messages[-1]["content"]
        if any(b.get("type") == "tool_result" for b in last):
            return [text("Done.")]
        if "Run the numbers" in last[-1]["text"]:
            return [
                tool_use(
                    "t2",
                    "analyze_roth_conversions",
                    {"scenario": SCENARIO, "user_confirmed": True},
                )
            ]
        return [
            tool_use(
                "t1",
                "prepare_scenario",
                {"scenario": SCENARIO},
            )
        ]

    conversation = await demo.generate_with_agent(FunctionModelClient(respond))
    assert conversation["source"] == "agent"
    assert_well_formed(conversation["messages"])
    assert any(e["type"] == "result" for e in conversation["exchanges"][1]["events"])


async def test_demo_is_cached_and_keyed(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("LUCERNA_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.setattr(demo, "_CACHE_DIR", tmp_path)
    demo.clear_cache()
    first = await demo.get_demo_conversation()
    second = await demo.get_demo_conversation()
    assert first is second
    assert first["cache_key"] == demo.cache_key()
    assert not list(tmp_path.iterdir())  # scripted versions are not persisted


async def test_demo_falls_back_when_agent_fails(monkeypatch, tmp_path):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(demo, "_CACHE_DIR", tmp_path)

    class Broken:
        async def stream(self, **kwargs):
            raise RuntimeError("boom")
            yield  # pragma: no cover

    monkeypatch.setattr(demo, "AnthropicModelClient", Broken)
    demo.clear_cache()
    conversation = await demo.get_demo_conversation()
    assert conversation["source"] == "scripted"
    demo.clear_cache()


async def test_demo_reads_disk_cache(monkeypatch, tmp_path):
    monkeypatch.setattr(demo, "_CACHE_DIR", tmp_path)
    demo.clear_cache()
    stored = {"source": "agent", "cache_key": demo.cache_key(), "exchanges": []}
    demo._write_disk(demo.cache_key(), stored)
    assert await demo.get_demo_conversation() == stored
    demo.clear_cache()
