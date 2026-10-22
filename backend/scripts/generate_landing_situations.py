"""Regenerate shared/fixtures/landing-situations.json from the optimizer.

Run from backend/:  python -m scripts.generate_landing_situations

The landing hero shows four illustrative households, one per "in-between years"
situation. Their savings, after-tax wealth and conversion schedules come from the
real engine (federal tax only, 2.5% inflation, today's dollars), so the page never
shows invented numbers. tests/scripts/test_landing_situations.py fails when the
engine's output drifts from the committed file; rerun this script when it does.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.engine.demo import DEMO_SCENARIO
from app.engine.optimizer import optimize
from app.engine.types import FilingStatus, PlanYear, ScenarioInput

OUTPUT = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "landing-situations.json"
START_YEAR = 2026


def _timeline(incomes: list[float]) -> list[PlanYear]:
    return [PlanYear(year=START_YEAR + i, gross_income=v) for i, v in enumerate(incomes)]


SITUATIONS: dict[str, ScenarioInput] = {
    # A couple retiring at 55, living on savings until Social Security at 67.
    "early-retirement": ScenarioInput(
        age=55,
        filing_status=FilingStatus.MFJ,
        timeline=_timeline([30000] * 12 + [62000] * 8),
        traditional_ira_balance=1_100_000,
        roth_ira_balance=60_000,
        drawdown_start_age=75,
        planning_horizon_age=92,
        inflation_rate=0.025,
    ),
    # Margaret, the demo household: retired at 63, Social Security at 67, RMDs at 73.
    "before-social-security": DEMO_SCENARIO,
    # A couple consulting part-time from 58, stopping at 65, Social Security at 67.
    "part-time": ScenarioInput(
        age=58,
        filing_status=FilingStatus.MFJ,
        timeline=_timeline([50000] * 7 + [20000] * 2 + [62000] * 8),
        traditional_ira_balance=950_000,
        roth_ira_balance=40_000,
        drawdown_start_age=75,
        planning_horizon_age=92,
        inflation_rate=0.025,
    ),
    # Single, 44, out of work for two years, then back to a $125K salary.
    "career-break": ScenarioInput(
        age=44,
        filing_status=FilingStatus.SINGLE,
        timeline=_timeline([12000, 12000] + [125000] * 19),
        traditional_ira_balance=320_000,
        roth_ira_balance=40_000,
        drawdown_start_age=65,
        planning_horizon_age=90,
        inflation_rate=0.025,
    ),
}


def build() -> dict:
    out = {}
    for key, scenario in SITUATIONS.items():
        result = optimize(scenario)
        conversions = [round(c) for c in result.yearly_conversions]
        while conversions and conversions[-1] == 0:
            conversions.pop()
        out[key] = {
            "start_age": scenario.age,
            "estimated_lifetime_tax_savings": round(result.estimated_lifetime_tax_savings),
            "after_tax_wealth_without": round(result.npv_at_zero),
            "after_tax_wealth_with": round(result.npv_at_optimal),
            "total_converted": round(result.total_conversion),
            "average_tax_rate": round(result.overall_effective_rate, 3),
            "conversions_by_year": conversions,
        }
    return out


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"wrote {OUTPUT}")
