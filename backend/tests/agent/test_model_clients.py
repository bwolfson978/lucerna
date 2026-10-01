"""Model clients: the Anthropic adapter (with a stubbed SDK) and the offline stand-in."""

from types import SimpleNamespace

import anthropic
import pytest

from app.agent import model as model_module
from app.agent.loop import run_turn
from app.agent.model import (
    AnthropicModelClient,
    Final,
    ModelUnavailable,
    TextDelta,
    ToolStart,
    get_model_client,
    set_model_client,
)
from app.agent.offline import OfflineModelClient, extract_update
from app.tools.draft import ScenarioDraft


class _Block(SimpleNamespace):
    def to_dict(self, mode="json"):
        return dict(self.__dict__)


class _FakeStream:
    def __init__(self, events, final):
        self._events = events
        self._final = final

    def __aiter__(self):
        async def gen():
            for event in self._events:
                yield event

        return gen()

    async def get_final_message(self):
        return self._final


class _Manager:
    def __init__(self, stream=None, error=None):
        self.stream = stream
        self.error = error
        self.kwargs = None

    def __call__(self, **kwargs):
        self.kwargs = kwargs
        return self

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.stream

    async def __aexit__(self, *exc):
        return False


def _client_with(manager) -> AnthropicModelClient:
    client = AnthropicModelClient.__new__(AnthropicModelClient)
    client._anthropic = anthropic
    client._client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=manager)))
    return client


async def test_anthropic_client_maps_stream_events():
    final = SimpleNamespace(
        content=[
            _Block(type="text", text="Hi"),
            _Block(type="tool_use", id="t", name="show", input={}),
        ],
        stop_reason="tool_use",
        usage=_Block(input_tokens=10, output_tokens=2),
        model="claude-sonnet-5-5",
    )
    events = [
        SimpleNamespace(type="text", text="Hi"),
        SimpleNamespace(
            type="content_block_start", content_block=SimpleNamespace(type="tool_use", name="show")
        ),
        SimpleNamespace(type="message_stop"),
    ]
    manager = _Manager(_FakeStream(events, final))
    out = [e async for e in _client_with(manager).stream(system="s", tools=[], messages=[])]
    assert isinstance(out[0], TextDelta) and out[0].text == "Hi"
    assert isinstance(out[1], ToolStart) and out[1].name == "show"
    assert isinstance(out[2], Final)
    assert out[2].turn.content[1]["name"] == "show"
    assert out[2].turn.usage == {"input_tokens": 10, "output_tokens": 2}
    # Request shape: refusal fallback, caching and effort are always set.
    assert manager.kwargs["fallbacks"] == "default"
    assert manager.kwargs["betas"] == ["server-side-fallback-2026-07-01"]
    assert manager.kwargs["cache_control"] == {"type": "ephemeral"}
    assert manager.kwargs["output_config"] == {"effort": model_module.EFFORT}


async def test_anthropic_client_maps_outages_to_unavailable():
    error = anthropic.APIConnectionError.__new__(anthropic.APIConnectionError)
    with pytest.raises(ModelUnavailable):
        async for _ in _client_with(_Manager(error=error)).stream(
            system="s", tools=[], messages=[]
        ):
            pass


def test_get_model_client_requires_credentials(monkeypatch):
    set_model_client(None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("AGENT_OFFLINE", raising=False)
    with pytest.raises(ModelUnavailable):
        get_model_client()
    monkeypatch.setenv("AGENT_OFFLINE", "1")
    assert isinstance(get_model_client(), OfflineModelClient)
    set_model_client(None)


def test_offline_extraction():
    update = extract_update(
        "I'm 52, married, income $90,000 a year, $600k in my 401k, Roth $40k, retire at 60"
    )
    assert update == {
        "age": 52,
        "filing_status": "married_filing_jointly",
        "retirement_age": 60,
        "current_income": 90000,
        "traditional_balance": 600000,
        "roth_balance": 40000,
    }


async def test_offline_client_drives_a_full_conversation():
    client = OfflineModelClient()
    history: list[dict] = []
    draft = ScenarioDraft()
    seen: list[str] = []
    for message in (
        "hello",
        "I'm 52, married, income $90,000 a year, $600k in my 401k, I want to retire at 60",
        "Looks right, run it",
        "What if I retire at 58?",
        "How do RMDs work?",
    ):
        async for event in run_turn(client=client, history=history, text=message, draft=draft):
            if event["type"] == "draft":
                draft = ScenarioDraft.model_validate(event["draft"])
            elif event["type"] == "part":
                seen.append(event["part"]["kind"])
            elif event["type"] == "done":
                history.extend(event["messages"])
    assert seen == [
        "scenario_summary",
        "mcp_app",
        "bracket_fill",
        "suggestions",
        "scenario_compare",
    ]
