"""POST /api/feedback — User feedback collection."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class FeedbackRequest(BaseModel):
    rating: int
    comment: str


class SuccessResponse(BaseModel):
    success: bool


@router.post("/feedback", response_model=SuccessResponse)
async def submit_feedback(request: FeedbackRequest):
    # MVP: log only, no persistent storage yet
    return SuccessResponse(success=True)
