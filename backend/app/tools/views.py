"""Display data for MCP App Views, derived from an engine result.

Views render shared components (ui/) that need chart series the model has no use for.
The server sends these in the tool result's ``_meta`` under ``VIEW_META_KEY``: hosts
pass ``_meta`` to the View but not to the model. The web app builds the same shapes
from full results (frontend/src/lib/results/viewData.ts); the shared fixture
shared/fixtures/view-data.json keeps the two in step.
"""

from __future__ import annotations

from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
from app.engine.types import OptimizationResult

VIEW_META_KEY = "lucerna/view"


def bracket_fill_view(result: OptimizationResult) -> dict:
    """The tax bracket chart (ui/src/BracketChart.tsx) as the results page draws it at the
    optimal schedule: per year, gross income, required withdrawal, conversion and the
    tax the conversion adds, plus the brackets (taxable income, ``max`` None for the top
    one) and standard deduction for the filing status."""
    rmd_by_year = (
        {d.year: d.rmd_amount for d in result.rmd_projection.yearly_detail}
        if result.rmd_projection
        else {}
    )
    years = []
    for i, plan_year in enumerate(result.input.timeline):
        fill = result.yearly_bracket_fill[i] if i < len(result.yearly_bracket_fill) else []
        conversion = result.yearly_conversions[i] if i < len(result.yearly_conversions) else 0
        years.append(
            {
                "year": plan_year.year,
                "age": result.input.age + i,
                "income": round(plan_year.gross_income),
                "rmd": round(rmd_by_year.get(plan_year.year, 0)),
                "conversion": round(conversion),
                "tax": round(sum(b.bracket_rate * b.filled_by_conversion for b in fill)),
            }
        )
    filing_status = result.input.filing_status
    brackets = [
        {
            "rate": b["rate"],
            "min": round(b["min"]),
            "max": None if b["max"] == float("inf") else round(b["max"]),
        }
        for b in BRACKETS[filing_status]
    ]
    return {
        "years": years,
        "brackets": brackets,
        "standard_deduction": round(STANDARD_DEDUCTION[filing_status]),
    }


def result_view(result: OptimizationResult) -> dict:
    return {"bracket_fill": bracket_fill_view(result)}
