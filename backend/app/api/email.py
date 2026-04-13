"""POST /api/email — Early-access email capture."""

import re

from fastapi import APIRouter
from pydantic import BaseModel, field_validator

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmailRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError("Invalid email address")
        return v


class SuccessResponse(BaseModel):
    success: bool


@router.post("/email", response_model=SuccessResponse)
async def capture_email(request: EmailRequest):
    # MVP: log only, no persistent storage yet
    return SuccessResponse(success=True)
