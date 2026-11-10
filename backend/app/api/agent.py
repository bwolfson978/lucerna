"""Conversational agent endpoints.

POST /api/agent           one user message, streamed back as server-sent events
POST /api/agent/feedback  the person's rating of one reply (thumbs, reason, note)
GET  /api/agent/demo      the cached /demo conversation (Margaret)
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent import demo as demo_conversation
from app.agent import feedback as reply_feedback
from app.agent.limits import Turn, estimate_cost, limiter
from app.agent.loop import ERROR_MESSAGES, count_user_messages, run_turn
from app.agent.model import ModelUnavailable, get_model_client
from app.agent.observability import DISTINCT_ID_HEADER, SESSION_ID_HEADER, TurnTrace, header
from app.mcp.limits import client_ip
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
async def agent(body: AgentRequest, request: Request):
    if len(json.dumps(body.messages)) > MAX_HISTORY_BYTES:
        return _stream(_single_error("too_long"))

    turn = limiter.check(client_ip(request), count_user_messages(body.messages))
    if not isinstance(turn, Turn):
        return _stream(_single_error(turn))

    try:
        client = get_model_client()
    except ModelUnavailable:
        turn.release()
        return _stream(_single_error("unavailable"))

    def on_usage(model: str, usage: dict) -> None:
        turn.record_spend(estimate_cost(model, usage))

    trace = TurnTrace.from_request(request)

    async def events() -> AsyncIterator[str]:
        try:
            async for event in run_turn(
                client=client,
                history=body.messages,
                text=body.message,
                draft=body.draft,
                start_year=current_year(),
                on_usage=on_usage,
                trace=trace,
            ):
                if event["type"] == "done" and event["messages"]:
                    # The reply's id, so the page can attach a rating to it.
                    event = {**event, "trace_id": trace.trace_id}
                yield _sse(event)
        finally:
            turn.release()

    return _stream(events())


class ReplyFeedbackRequest(BaseModel):
    trace_id: str = Field(pattern=reply_feedback.TRACE_ID.pattern)
    # Rises with every change the page sends for this reply; older ones are ignored.
    seq: int = Field(ge=0)
    rating: reply_feedback.Rating | None = None  # None clears the rating
    reason: reply_feedback.Reason | None = None
    note: str | None = Field(default=None, max_length=reply_feedback.MAX_NOTE)


class ReplyFeedbackResponse(BaseModel):
    success: bool
    applied: bool


@router.post("/agent/feedback", response_model=ReplyFeedbackResponse)
def agent_feedback(body: ReplyFeedbackRequest, request: Request):
    try:
        applied = reply_feedback.record(
            trace_id=body.trace_id,
            seq=body.seq,
            rating=body.rating,
            reason=body.reason,
            note=body.note,
            caller=f"ip:{client_ip(request)}",
            distinct_id=header(request, DISTINCT_ID_HEADER),
            session_id=header(request, SESSION_ID_HEADER),
        )
    except reply_feedback.FeedbackLimitReached:
        raise HTTPException(status_code=429, detail="Too many ratings today.") from None
    return ReplyFeedbackResponse(success=True, applied=applied)


@router.get("/agent/demo")
async def agent_demo():
    return await demo_conversation.get_demo_conversation()
