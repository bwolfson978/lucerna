import asyncio

from fastapi import APIRouter

from app.engine.types import ScenarioInput, OptimizationResult
from app.engine.optimizer import optimize

router = APIRouter()


@router.post("/optimize", response_model=OptimizationResult)
async def run_optimize(scenario: ScenarioInput):
    """Run the multi-year Roth conversion optimizer."""
    return await asyncio.to_thread(optimize, scenario)
