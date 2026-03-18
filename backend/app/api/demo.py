from fastapi import APIRouter

from app.engine.demo import get_demo

router = APIRouter()


@router.get("/demo")
async def demo():
    """Get the pre-computed Alex demo scenario and results."""
    return get_demo()
