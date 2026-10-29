"""Langfuse conversation tracing: off by default, masks contact details, one trace per turn."""

import pytest

from app.agent import tracing
from app.agent.loop import run_turn
from app.agent.observability import TurnTrace
from app.tools.draft import ScenarioDraft
from tests.agent.fakes import UNAVAILABLE, ScriptedModelClient, text, tool_use


class FakeObservation:
    def __init__(self, log, name, as_type, **fields):
        self.log = log
        self.record = {"name": name, "as_type": as_type, **fields, "ended": False}
        log.append(self.record)

    def start_observation(self, *, name, as_type="span", **fields):
        return FakeObservation(self.log, name, as_type, parent=self.record["name"], **fields)

    def update(self, **fields):
        self.record.update(fields)

    def end(self):
        self.record["ended"] = True


class FakeLangfuse:
    def __init__(self):
        self.log = []

    def start_observation(self, *, name, as_type="span", **fields):
        return FakeObservation(self.log, name, as_type, **fields)


@pytest.fixture
def langfuse(monkeypatch):
    fake = FakeLangfuse()
    monkeypatch.setattr(tracing, "_client", fake)
    yield fake
    tracing._client = None


async def run(client, trace, text_in="hello"):
    return [
        event
        async for event in run_turn(
            client=client,
            history=[],
            text=text_in,
            draft=ScenarioDraft(),
            start_year=2026,
            trace=trace,
        )
    ]


def test_off_by_default(monkeypatch):
    monkeypatch.setattr(tracing, "_client", None)
    assert tracing.enabled() is False
    assert tracing.client() is None


def test_needs_both_keys(monkeypatch):
    monkeypatch.setattr(tracing, "_client", None)
    monkeypatch.setenv("LANGFUSE_TRACING", "true")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    assert tracing.enabled() is False
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    assert tracing.enabled() is True


def test_mask_removes_contact_details_but_keeps_figures():
    masked = tracing.mask(
        data={
            "messages": [
                "Email me at jane.doe+roth@example.com or call (617) 555-0142.",
                "Born 1974, we make $90,000 and have 600000 in a 401(k).",
            ]
        }
    )
    assert masked == {
        "messages": [
            "Email me at [email] or call [phone].",
            "Born 1974, we make $90,000 and have 600000 in a 401(k).",
        ]
    }


def test_client_exports_only_langfuse_spans(monkeypatch):
    from langfuse.span_filter import is_langfuse_span

    created = {}
    monkeypatch.setattr(tracing, "_client", None)
    monkeypatch.setenv("LANGFUSE_TRACING", "true")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    monkeypatch.setattr("langfuse.Langfuse", lambda **kwargs: created.update(kwargs) or object())
    assert tracing.client() is not None
    assert created["mask"] is tracing.mask
    assert created["should_export_span"] is is_langfuse_span
    tracing._client = None


async def test_turn_without_tracing_records_nothing(monkeypatch):
    monkeypatch.setattr(tracing, "_client", None)
    trace = TurnTrace()
    events = await run(ScriptedModelClient([[text("Hi there.")]]), trace)
    assert events[-1]["type"] == "done"
    assert trace._root is None


async def test_turn_is_one_trace_with_generations_and_tools(langfuse):
    client = ScriptedModelClient(
        [
            [tool_use("t1", "get_tax_brackets", {"filing_status": "single", "year": 2026})],
            [text("Here are the brackets.")],
        ]
    )
    trace = TurnTrace(distinct_id="person-1", session_id="session-1")
    await run(client, trace, text_in="What are the brackets?")

    root, *children = langfuse.log
    assert root["name"] == "website_assistant"
    assert root["input"] == "What are the brackets?"
    assert root["output"] == "Here are the brackets."
    assert root["ended"]
    assert [(c["as_type"], c["name"]) for c in children] == [
        ("generation", "claude"),
        ("tool", "get_tax_brackets"),
        ("generation", "claude"),
    ]
    assert all(c["ended"] and c["parent"] == "website_assistant" for c in children)
    first, tool, second = children
    assert first["input"][0]["role"] == "system"
    assert first["input"][-1]["role"] == "user"
    assert first["usage_details"]["input"] > 0
    assert first["cost_details"]["output"] > 0
    assert first["cost_details"]["total"] == sum(
        v for k, v in first["cost_details"].items() if k != "total"
    )
    assert tool["input"] == {"filing_status": "single", "year": 2026}
    assert tool["output"] is not None
    assert second["output"][0]["text"] == "Here are the brackets."


async def test_unavailable_model_marks_the_trace(langfuse):
    trace = TurnTrace()
    events = await run(ScriptedModelClient([UNAVAILABLE]), trace)
    assert any(e["type"] == "error" for e in events)
    root, generation = langfuse.log
    assert generation["level"] == "ERROR" and generation["ended"]
    assert root["status_message"] == "unavailable" and root["ended"]
