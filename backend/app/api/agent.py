"""Conversational agent endpoints.

POST /api/agent        one user message, streamed back as server-sent events
GET  /api/agent/demo   the cached /demo conversation (Margaret)
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent import demo as demo_conversation
from app.agent.limits import estimate_cost, limiter
from app.agent.loop import ERROR_MESSAGES, count_user_messages, run_turn
from app.agent.model import ModelUnavailable, get_model_client
from app.auth.identity import optional_user
from app.tools.draft import ScenarioDraft, current_year

router = APIRouter()

MAX_HISTORY_BYTES = 800_000


class AgentRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    messages: list[dict[str, Any]] = Field(
        default_factory=list,
        max_length=400,
        description="Conversation history in Messages API format, exactly as returned in done events",
    )
    draft: ScenarioDraft = Field(default_factory=ScenarioDraft)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, separators=(',', ':'))}\n\n"


async def _single_error(code: str) -> AsyncIterator[str]:
    yield _sse({"type": "error", "code": code, "message": ERROR_MESSAGES[code]})
    yield _sse({"type": "done", "messages": []})


def _stream(events: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/agent")
async def agent(body: AgentRequest, request: Request, user_id: str | None = Depends(optional_user)):
    if len(json.dumps(body.messages)) > MAX_HISTORY_BYTES:
        return _stream(_single_error("too_long"))

    # Signed-in people get their own daily allowance instead of sharing their network's.
    limit_key = f"user:{user_id}" if user_id else client_ip(request)
    limit = limiter.check(limit_key, count_user_messages(body.messages))
    if limit is not None:
        return _stream(_single_error(limit))

    try:
        client = get_model_client()
    except ModelUnavailable:
        return _stream(_single_error("unavailable"))

    def on_usage(model: str, usage: dict) -> None:
        limiter.record_spend(estimate_cost(model, usage))

    async def events() -> AsyncIterator[str]:
        async for event in run_turn(
            client=client,
            history=body.messages,
            text=body.message,
            draft=body.draft,
            start_year=current_year(),
            on_usage=on_usage,
            user_id=user_id,
        ):
            yield _sse(event)

    return _stream(events())


@router.get("/agent/demo")
async def agent_demo():
    return await demo_conversation.get_demo_conversation()
