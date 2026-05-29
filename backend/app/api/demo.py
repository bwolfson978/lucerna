import asyncio

from fastapi import APIRouter

from app.engine.demo import get_demo

router = APIRouter()


@router.get("/demo")
async def demo():
    """Get the pre-computed Margaret demo scenario and results."""
    return await asyncio.to_thread(get_demo)
