import asyncio
from typing import Any

from fastapi import APIRouter

from app.engine.optimizer import optimize
from app.engine.types import OptimizationResult, ScenarioInput
from app.tools import core
from app.tools.views import browser_result

router = APIRouter()


class OptimizeResponse(OptimizationResult):
    """The engine result plus what the result card and results page show for it
    (app/tools/views.py result_display), so the web app doesn't rebuild that itself."""

    display: dict[str, Any]


@router.post("/optimize", response_model=OptimizeResponse)
async def run_optimize(scenario: ScenarioInput):
    """Run the multi-year Roth conversion optimizer."""
    result = await asyncio.to_thread(optimize, scenario)
    return browser_result(result, core.result_id_for(scenario))
