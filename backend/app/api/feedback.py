"""POST /api/feedback: the website's feedback and problem-report form.

Sends to PostHog Surveys through app.tools.feedback, the same path the MCP tools use.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.mcp.limits import client_ip
from app.tools import feedback

router = APIRouter()


class FeedbackRequest(BaseModel):
    kind: feedback.FeedbackKind = feedback.FeedbackKind.FEEDBACK
    message: str = Field(max_length=feedback.MAX_MESSAGE)
    expected: str | None = Field(default=None, max_length=feedback.MAX_MESSAGE)
    email: str | None = Field(default=None, max_length=feedback.MAX_EMAIL)
    # Context the page adds on its own (none of it typed by the user).
    page_url: str | None = Field(default=None, max_length=feedback.MAX_CONTEXT)
    error_digest: str | None = Field(default=None, max_length=200)
    # posthog-js ids, so the report links to the person and their session replay.
    distinct_id: str | None = Field(default=None, max_length=200)
    session_id: str | None = Field(default=None, max_length=200)


class FeedbackResponse(BaseModel):
    success: bool
    id: str


@router.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(body: FeedbackRequest, request: Request):
    try:
        submission_id = feedback.submit(
            body.kind,
            body.message,
            source=feedback.WEB,
            caller=f"ip:{client_ip(request)}",
            expected=body.expected,
            email=body.email,
            distinct_id=body.distinct_id or None,
            context={
                "page_url": body.page_url,
                "error_digest": body.error_digest,
                "$session_id": body.session_id,
            },
        )
    except feedback.FeedbackLimitReached:
        raise HTTPException(
            status_code=429, detail="Too many messages today. Please try again tomorrow."
        ) from None
    except feedback.FeedbackError as err:
        raise HTTPException(status_code=422, detail=str(err)) from None
    return FeedbackResponse(success=True, id=submission_id)
