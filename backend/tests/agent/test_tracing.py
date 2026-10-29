"""Langfuse conversation tracing: off by default, masks contact details, one trace per turn."""

import pytest
from opentelemetry import trace as otel_trace

from app.agent import tracing
from app.agent.loop import run_turn
from app.agent.observability import TurnTrace
from app.tools.draft import ScenarioDraft
from tests.agent.fakes import UNAVAILABLE, ScriptedModelClient, text, tool_use


class FakeObservation:
    def __init__(self, log, name, as_type, **fields):
        self.log = log
        self.record = {"name": name, "as_type": as_type, **fields, "ended": False}
        self._otel_span = otel_trace.NonRecordingSpan(
            otel_trace.SpanContext(trace_id=1, span_id=len(log) + 1, is_remote=False)
        )
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


def test_client_exports_our_observations_and_model_calls_masked(monkeypatch):
    created = {}
    monkeypatch.setattr(tracing, "_client", None)
    monkeypatch.setenv("LANGFUSE_TRACING", "true")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    monkeypatch.setattr("langfuse.Langfuse", lambda **kwargs: created.update(kwargs) or object())
    assert tracing.client() is not None
    assert created["mask"] is tracing.mask
    assert created["mask_otel_spans"] is tracing.mask_otel_spans
    assert created["should_export_span"] is tracing.should_export
    assert tracing.anthropic_open_telemetry() == {"traces": {"content_mode": "content"}}
    tracing._client = None


def test_model_call_content_only_when_tracing(monkeypatch):
    monkeypatch.setattr(tracing, "_client", None)
    assert tracing.anthropic_open_telemetry() == {"traces": {"content_mode": "metadata_only"}}


def _span(scope, attributes=None):
    from opentelemetry.sdk.trace import ReadableSpan
    from opentelemetry.sdk.util.instrumentation import InstrumentationScope

    return ReadableSpan(
        name="call", instrumentation_scope=InstrumentationScope(scope), attributes=attributes
    )


def test_exports_anthropic_sdk_spans_but_not_other_libraries():
    assert tracing.should_export(_span("com.anthropic.sdk.python"))
    assert tracing.should_export(_span("langfuse-sdk"))
    assert not tracing.should_export(_span("opentelemetry.instrumentation.httpx"))


def test_model_call_spans_are_masked():
    from langfuse.types import MaskOtelSpansParams, OtelSpanData, OtelSpanIdentifier

    def data(span_id, attributes):
        return OtelSpanData(
            trace_id="0" * 32,
            span_id=span_id,
            parent_span_id=None,
            name="call",
            instrumentation_scope_name=tracing.ANTHROPIC_SCOPE,
            instrumentation_scope_version=None,
            attributes=attributes,
            resource_attributes={},
        )

    leaky = OtelSpanIdentifier(trace_id="0" * 32, span_id="1" * 16)
    clean = OtelSpanIdentifier(trace_id="0" * 32, span_id="2" * 16)
    messages = '[{"role": "user", "parts": [{"type": "text", "content": "jane@example.com"}]}]'
    result = tracing.mask_otel_spans(
        params=MaskOtelSpansParams(
            spans={
                leaky: data("1" * 16, {"gen_ai.input.messages": messages, "tokens": 5}),
                clean: data("2" * 16, {"gen_ai.input.messages": "[]"}),
            }
        )
    )
    assert set(result.span_patches) == {leaky}
    patched = result.span_patches[leaky].set_attributes["gen_ai.input.messages"]
    assert "jane@example.com" not in patched and "[email]" in patched


async def test_turn_without_tracing_records_nothing(monkeypatch):
    monkeypatch.setattr(tracing, "_client", None)
    trace = TurnTrace()
    events = await run(ScriptedModelClient([[text("Hi there.")]]), trace)
    assert events[-1]["type"] == "done"
    assert trace._root is None


class CurrentSpanClient(ScriptedModelClient):
    """Notes the OpenTelemetry span current during each model call, where the Anthropic
    SDK starts its own span."""

    def __init__(self, turns):
        super().__init__(turns)
        self.parents = []

    def stream(self, **kwargs):
        self.parents.append(otel_trace.get_current_span())
        return super().stream(**kwargs)


async def test_turn_is_one_trace_with_model_calls_and_tools(langfuse):
    client = CurrentSpanClient(
        [
            [tool_use("t1", "get_tax_brackets", {"filing_status": "single", "year": 2026})],
            [text("Here are the brackets.")],
        ]
    )
    trace = TurnTrace(distinct_id="person-1", session_id="session-1")
    await run(client, trace, text_in="What are the brackets?")

    root, tool = langfuse.log
    assert root["name"] == "website_assistant"
    assert root["input"] == "What are the brackets?"
    assert root["output"] == "Here are the brackets."
    assert root["ended"]
    # Model calls are the SDK's spans, children of the root; tools are ours.
    assert len(client.parents) == 2
    assert all(p.get_span_context().span_id == 1 for p in client.parents)
    assert otel_trace.get_current_span() is otel_trace.INVALID_SPAN
    assert (tool["as_type"], tool["name"], tool["parent"]) == (
        "tool",
        "get_tax_brackets",
        "website_assistant",
    )
    assert tool["input"] == {"filing_status": "single", "year": 2026}
    assert tool["output"] is not None and tool["ended"]


async def test_unavailable_model_marks_the_trace(langfuse):
    trace = TurnTrace()
    events = await run(ScriptedModelClient([UNAVAILABLE]), trace)
    assert any(e["type"] == "error" for e in events)
    (root,) = langfuse.log
    assert root["status_message"] == "unavailable" and root["ended"]
