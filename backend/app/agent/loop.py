"""The agent loop: one user message in, a stream of events out.

The backend is stateless. The browser keeps the API-format history (assistant
turns are stored exactly as the model returned them, thinking blocks included)
and the scenario draft, and sends both with each message. The loop appends the
new user turn, alternates model turns and tool calls until the model finishes,
and streams events for the UI as it goes:

    text_delta  {text}
    tool_start  {name, status}
    draft       {draft, missing}
    result      {result_id, label, result, draft?}
    part        {part}
    error       {code, message}
    done        {messages}

``done.messages`` holds the turns to append to the stored history. History is
append-only: nothing earlier in it is rewritten.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager

from app import error_tracking
from app.agent.model import MODEL, Final, ModelClient, ModelUnavailable, TextDelta, ToolStart
from app.agent.observability import TurnTrace
from app.agent.prompts import SYSTEM_PROMPT
from app.agent.toolbox import STATUS, McpToolbox, ToolContext, open_toolbox
from app.tools import core
from app.tools.draft import ScenarioDraft, current_year

logger = logging.getLogger(__name__)

ToolboxFactory = Callable[[], AbstractAsyncContextManager[McpToolbox]]

MAX_MODEL_CALLS_PER_TURN = 8
MAX_TOOL_CALLS_PER_TURN = 12

_DRAFT_HASH = re.compile(r'draft_hash[\\"\s:=]+([0-9a-f]{12})')

ERROR_MESSAGES = {
    "conversation_limit": (
        "This conversation has reached its message limit. Your scenario is saved in the form, "
        "where you can keep adjusting it."
    ),
    "daily_limit": (
        "You've reached today's limit for the assistant. Your scenario is saved in the form, "
        "where you can keep working."
    ),
    "unavailable": (
        "The assistant is unavailable right now. Your scenario is saved in the form, where you "
        "can keep working."
    ),
    "refusal": "I can't help with that one. I can answer questions about Roth conversions and your scenario.",
    "too_long": "That conversation is too long to continue. Start a new one or use the form.",
}


def count_user_messages(history: list[dict]) -> int:
    """User turns that carry the user's own words (tool results don't count)."""
    count = 0
    for message in history:
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str) or (
            isinstance(content, list)
            and any(isinstance(b, dict) and b.get("type") == "text" for b in content)
        ):
            count += 1
    return count


def last_seen_draft_hash(history: list[dict]) -> str | None:
    matches = _DRAFT_HASH.findall(json.dumps(history))
    return matches[-1] if matches else None


def build_user_turn(
    text: str, draft: ScenarioDraft, history: list[dict], start_year: int | None = None
) -> dict:
    """The user's message, prefixed with the scenario if it changed outside the conversation."""
    blocks: list[dict] = []
    described = core.describe_draft(draft, start_year or current_year())
    has_values = bool(described["scenario"].keys() - _DEFAULT_ONLY_KEYS) or described["timeline"]
    if has_values and last_seen_draft_hash(history) != described["draft_hash"]:
        blocks.append(
            {
                "type": "text",
                "text": "<scenario_state>\n"
                + json.dumps(described, separators=(",", ":"))
                + "\n</scenario_state>",
            }
        )
    blocks.append({"type": "text", "text": text})
    return {"role": "user", "content": blocks}


# Keys that hold defaults even on an empty draft; their presence alone means nothing was entered.
_DEFAULT_ONLY_KEYS = {
    "income_growth_rate_pct",
    "planning_horizon_age",
    "investment_return_pct",
    "discount_rate_pct",
    "include_aca",
    "household_size",
    "monthly_slcsp_premium",
}


async def run_turn(
    *,
    client: ModelClient,
    history: list[dict],
    text: str,
    draft: ScenarioDraft,
    start_year: int | None = None,
    on_usage=None,
    trace: TurnTrace | None = None,
    toolbox_factory: ToolboxFactory = open_toolbox,
) -> AsyncIterator[dict]:
    """Run one user message through the agent. Yields UI events (see module docstring).

    The turn runs in a worker task that owns the MCP client session for its whole life;
    this generator only relays its events, so a disconnecting browser cancels cleanly.
    """
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def worker() -> None:
        try:
            async with toolbox_factory() as toolbox:
                async for event in _run_turn(
                    client=client,
                    toolbox=toolbox,
                    history=history,
                    text=text,
                    draft=draft,
                    start_year=start_year or current_year(),
                    on_usage=on_usage,
                    trace=trace,
                ):
                    await queue.put(event)
        except Exception as exc:
            logger.exception("Agent turn failed")
            error_tracking.capture_exception(exc, source="agent_turn")
            await queue.put(_error("unavailable"))
            await queue.put({"type": "done", "messages": []})
        finally:
            await queue.put(None)

    task = asyncio.create_task(worker())
    try:
        while (event := await queue.get()) is not None:
            yield event
    finally:
        if not task.done():
            task.cancel()


async def _run_turn(
    *,
    client: ModelClient,
    toolbox: McpToolbox,
    history: list[dict],
    text: str,
    draft: ScenarioDraft,
    start_year: int,
    on_usage=None,
    trace: TurnTrace | None = None,
) -> AsyncIterator[dict]:
    ctx = ToolContext(draft=draft, start_year=start_year)
    user_turn = build_user_turn(text, draft, history, start_year)
    new_messages: list[dict] = [user_turn]
    tools = toolbox.definitions
    tool_calls = 0

    for _ in range(MAX_MODEL_CALLS_PER_TURN):
        turn = None
        start = time.monotonic()
        first_token: float | None = None
        try:
            async for event in client.stream(
                system=SYSTEM_PROMPT, tools=tools, messages=[*history, *new_messages]
            ):
                if first_token is None and isinstance(event, TextDelta | ToolStart):
                    first_token = time.monotonic() - start
                if isinstance(event, TextDelta):
                    if event.text.strip():
                        ctx.wrote_text = True
                    yield {"type": "text_delta", "text": event.text}
                elif isinstance(event, ToolStart):
                    yield {
                        "type": "tool_start",
                        "name": event.name,
                        "status": STATUS.get(event.name, "Working"),
                    }
                elif isinstance(event, Final):
                    turn = event.turn
        except ModelUnavailable as err:
            if trace is not None:
                trace.generation(
                    model=MODEL, latency=time.monotonic() - start, error=f"unavailable: {err}"
                )
            yield _error("unavailable")
            yield {"type": "done", "messages": []}
            return

        if turn is None:  # pragma: no cover - a client must always finish with Final
            yield _error("unavailable")
            yield {"type": "done", "messages": []}
            return
        if on_usage is not None:
            on_usage(turn.model, turn.usage)
        if trace is not None:
            trace.generation(
                model=turn.model,
                usage=turn.usage,
                latency=time.monotonic() - start,
                time_to_first_token=first_token,
                stop_reason=turn.stop_reason,
            )

        if turn.stop_reason == "refusal":
            # Drop the whole exchange so the stored history stays valid.
            yield _error("refusal")
            yield {"type": "done", "messages": []}
            return

        new_messages.append({"role": "assistant", "content": turn.content})
        tool_uses = [b for b in turn.content if b.get("type") == "tool_use"]

        if turn.stop_reason == "pause_turn":
            continue
        if not tool_uses:
            break
        if turn.stop_reason == "max_tokens":
            # A tool call cut off mid-input: answer it with an error instead of running it,
            # so every tool_use keeps its matching tool_result.
            new_messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": b["id"],
                            "content": "Tool input was cut off. Try again with a shorter call.",
                            "is_error": True,
                        }
                        for b in tool_uses
                    ],
                }
            )
            continue

        results = []
        for block in tool_uses:
            tool_calls += 1
            if tool_calls > MAX_TOOL_CALLS_PER_TURN:
                content, is_error = {"error": "Tool call limit reached for this message."}, True
            else:
                before = len(ctx.events)
                content, is_error = await toolbox.call(block["name"], block.get("input"), ctx)
                for event in ctx.events[before:]:
                    yield event
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block["id"],
                    "content": json.dumps(content, separators=(",", ":")),
                    **({"is_error": True} if is_error else {}),
                }
            )
        new_messages.append({"role": "user", "content": results})
    else:
        # Ran out of model calls while the model still wanted tools. Close the turn
        # with a short assistant message so the history stays well-formed.
        if new_messages[-1]["role"] == "user":
            note = "I ran out of steps for this message. Ask me to continue."
            new_messages.append({"role": "assistant", "content": [{"type": "text", "text": note}]})
            yield {"type": "text_delta", "text": note}

    yield {"type": "done", "messages": new_messages}


def _error(code: str) -> dict:
    return {"type": "error", "code": code, "message": ERROR_MESSAGES[code]}
