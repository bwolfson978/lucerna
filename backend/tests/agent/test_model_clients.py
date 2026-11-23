"""Model clients: the Anthropic adapter (with a stubbed SDK) and the offline stand-in."""

import datetime
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

THIS_YEAR = datetime.date.today().year


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
            _Block(type="tool_use", id="t", name="get_tax_brackets", input={}),
        ],
        stop_reason="tool_use",
        usage=_Block(input_tokens=10, output_tokens=2),
        model="claude-sonnet-5-5",
    )
    events = [
        SimpleNamespace(type="text", text="Hi"),
        SimpleNamespace(
            type="content_block_start",
            content_block=SimpleNamespace(type="tool_use", name="get_tax_brackets"),
        ),
        SimpleNamespace(type="message_stop"),
    ]
    manager = _Manager(_FakeStream(events, final))
    out = [e async for e in _client_with(manager).stream(system="s", tools=[], messages=[])]
    assert isinstance(out[0], TextDelta) and out[0].text == "Hi"
    assert isinstance(out[1], ToolStart) and out[1].name == "get_tax_brackets"
    assert isinstance(out[2], Final)
    assert out[2].turn.content[1]["name"] == "get_tax_brackets"
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


class _Create:
    """Stands in for ``client.with_options(...).messages.create``."""

    def __init__(self, message=None, error=None):
        self.message = message
        self.error = error
        self.options = None
        self.kwargs = None

    def with_options(self, **options):
        self.options = options
        return SimpleNamespace(messages=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.message


def _task_client(create: _Create) -> AnthropicModelClient:
    client = AnthropicModelClient.__new__(AnthropicModelClient)
    client._anthropic = anthropic
    client._client = create
    return client


def _message(*blocks):
    return SimpleNamespace(
        content=list(blocks),
        usage=_Block(input_tokens=900, output_tokens=40),
        model="claude-haiku-5-5",
    )


SCHEMA = {"type": "object", "properties": {}, "required": [], "additionalProperties": False}


async def test_task_asks_the_small_model_for_json():
    create = _Create(
        _message(
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text='{"questions": ["What if I retire at 58?"]}'),
        )
    )
    reply = await _task_client(create).task(system="s", prompt="p", schema=SCHEMA)
    assert reply.data == {"questions": ["What if I retire at 58?"]}
    assert reply.usage == {"input_tokens": 900, "output_tokens": 40}
    assert reply.model == "claude-haiku-5-5"
    # A side job: the small model, a short deadline and no retries.
    assert create.options == {"timeout": model_module.TASK_TIMEOUT_S, "max_retries": 0}
    assert create.kwargs["model"] == model_module.TASK_MODEL == "claude-haiku-5-5"
    assert create.kwargs["system"] == "s"
    assert create.kwargs["messages"] == [{"role": "user", "content": "p"}]
    assert create.kwargs["output_config"] == {
        "effort": "low",
        "format": {"type": "json_schema", "schema": SCHEMA},
    }


async def test_task_returns_nothing_usable_as_empty_data():
    for text in ("", "not json", '["a list"]', '{"questions": ["cut off'):
        create = _Create(_message(SimpleNamespace(type="text", text=text)))
        reply = await _task_client(create).task(system="s", prompt="p", schema=SCHEMA)
        assert reply.data == {}


async def test_task_maps_outages_to_unavailable_and_raises_our_own_mistakes():
    timeout = anthropic.APITimeoutError.__new__(anthropic.APITimeoutError)
    with pytest.raises(ModelUnavailable):
        await _task_client(_Create(error=timeout)).task(system="s", prompt="p", schema=SCHEMA)

    bad_request = anthropic.BadRequestError.__new__(anthropic.BadRequestError)
    bad_request.status_code = 400
    with pytest.raises(anthropic.BadRequestError):
        await _task_client(_Create(error=bad_request)).task(system="s", prompt="p", schema=SCHEMA)


def test_get_model_client_requires_credentials(monkeypatch):
    set_model_client(None)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("LUCERNA_ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("AGENT_OFFLINE", raising=False)
    with pytest.raises(ModelUnavailable):
        get_model_client()
    monkeypatch.setenv("AGENT_OFFLINE", "1")
    assert isinstance(get_model_client(), OfflineModelClient)
    set_model_client(None)


def test_offline_extraction():
    update = extract_update(
        "Born June 1974, my wife in March 1975, married, income $90,000 a year, "
        "$600k in my 401k, Roth $40k, retire at 60"
    )
    assert update == {
        "birth_year": 1974,
        "birth_month": 6,
        "filing_status": "married_filing_jointly",
        "spouse_birth_year": 1975,
        "spouse_birth_month": 3,
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
        "Born June 1974, my wife in March 1975, married, income $90,000 a year, $600k in my "
        "401k, I want to retire at 60",
        "Looks right, run it",
        "What if I retire at 58?",
        # What the comparison card's Apply button sends (ui/src/messages.ts).
        'Use the "Retire at 58" what-if as my scenario.',
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
        "scenario_summary",  # the scenario is complete
        "mcp_app",  # the result card
        "suggestions",
        "mcp_app",  # the comparison card
        "suggestions",
        "scenario_summary",  # the what-if applied: check it, so no follow-up questions
        "suggestions",  # after the methodology answer
    ]
    assert draft.retirement_age == 58


def test_api_key_falls_back_to_lucerna_name(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    monkeypatch.delenv("LUCERNA_ANTHROPIC_API_KEY", raising=False)
    assert model_module.api_key() is None
    assert not model_module.has_credentials()
    monkeypatch.setenv("LUCERNA_ANTHROPIC_API_KEY", "lucerna-key")
    assert model_module.api_key() == "lucerna-key"
    assert model_module.has_credentials()
    assert model_module.AnthropicModelClient()._client.api_key == "lucerna-key"
    monkeypatch.setenv("ANTHROPIC_API_KEY", "standard-key")
    assert model_module.api_key() == "standard-key"
