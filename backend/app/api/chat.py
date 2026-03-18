"""POST /api/chat — AI-powered explanation of optimization results."""

import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


def get_anthropic_client():
    """Return an Anthropic client. Separated for easy test mocking."""
    from anthropic import Anthropic

    return Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))


class ChatRequest(BaseModel):
    message: str
    context: dict = {}


class ChatResponse(BaseModel):
    response: str


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    from app.ai.system_prompt import SYSTEM_PROMPT

    client = get_anthropic_client()
    result = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Context: {request.context}\n\nQuestion: {request.message}",
            }
        ],
    )
    return ChatResponse(response=result.content[0].text)
