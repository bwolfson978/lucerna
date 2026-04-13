import asyncio

from fastapi import APIRouter

from app.engine.optimizer import optimize
from app.engine.types import OptimizationResult, ScenarioInput

router = APIRouter()


@router.post("/optimize", response_model=OptimizationResult)
async def run_optimize(scenario: ScenarioInput):
    """Run the multi-year Roth conversion optimizer."""
    return await asyncio.to_thread(optimize, scenario)
