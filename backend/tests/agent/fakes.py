"""Scripted model clients for agent tests."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable

from app.agent.model import (
    Final,
    ModelTurn,
    ModelUnavailable,
    StreamEvent,
    TaskReply,
    TextDelta,
    ToolStart,
)


def text(value: str) -> dict:
    return {"type": "text", "text": value}


def tool_use(tool_id: str, name: str, payload: dict) -> dict:
    return {"type": "tool_use", "id": tool_id, "name": name, "input": payload}


class ScriptedModelClient:
    """Returns pre-written assistant turns in order and records every request."""

    def __init__(
        self,
        turns: list[list[dict] | tuple[list[dict], str] | Exception],
        follow_ups: list[str] | Exception | None = None,
    ):
        self.turns = list(turns)
        self.calls: list[dict] = []
        # What the task model answers when asked for follow-up questions, and each request.
        self.follow_ups = follow_ups
        self.task_calls: list[dict] = []

    async def stream(
        self, *, system: str, tools: list[dict], messages: list[dict]
    ) -> AsyncIterator[StreamEvent]:
        self.calls.append({"system": system, "tools": tools, "messages": list(messages)})
        turn = self.turns.pop(0)
        if isinstance(turn, Exception):
            raise turn
        content, stop = turn if isinstance(turn, tuple) else (turn, None)
        if stop is None:
            stop = "tool_use" if any(b["type"] == "tool_use" for b in content) else "end_turn"
        for block in content:
            if block["type"] == "text":
                yield TextDelta(block["text"])
            elif block["type"] == "tool_use":
                yield ToolStart(block["name"])
        yield Final(
            ModelTurn(
                content=content,
                stop_reason=stop,
                usage={"input_tokens": 1000, "output_tokens": 100},
                model="claude-sonnet-5-5",
            )
        )

    async def task(self, *, system: str, prompt: str, schema: dict) -> TaskReply:
        self.task_calls.append({"system": system, "prompt": prompt, "schema": schema})
        if isinstance(self.follow_ups, Exception):
            raise self.follow_ups
        return TaskReply(
            data={"questions": self.follow_ups or []},
            usage={"input_tokens": 500, "output_tokens": 50},
            model="claude-haiku-5-5",
        )


class FunctionModelClient:
    """Decides each turn from the request messages."""

    def __init__(self, respond: Callable[[list[dict]], list[dict]]):
        self.respond = respond

    async def stream(self, *, system, tools, messages) -> AsyncIterator[StreamEvent]:
        content = self.respond(messages)
        stop = "tool_use" if any(b["type"] == "tool_use" for b in content) else "end_turn"
        for block in content:
            if block["type"] == "text":
                yield TextDelta(block["text"])
            elif block["type"] == "tool_use":
                yield ToolStart(block["name"])
        yield Final(ModelTurn(content=content, stop_reason=stop))

    async def task(self, *, system: str, prompt: str, schema: dict) -> TaskReply:
        return TaskReply(data={"questions": []})


UNAVAILABLE = ModelUnavailable("test")
