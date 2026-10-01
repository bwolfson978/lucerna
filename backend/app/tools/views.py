"""Display data for MCP App Views, derived from an engine result.

Views render shared components (ui/) that need chart series the model has no use for.
The server sends these in the tool result's ``_meta`` under ``VIEW_META_KEY``: hosts
pass ``_meta`` to the View but not to the model. The web app builds the same shapes
from full results (frontend/src/lib/results/viewData.ts); the shared fixture
shared/fixtures/view-data.json keeps the two in step.
"""

from __future__ import annotations

from app.engine.types import OptimizationResult

VIEW_META_KEY = "lucerna/view"


def bracket_fill_view(result: OptimizationResult) -> dict:
    """Per year: other taxable income, the conversion, and the brackets it fills."""
    years = []
    for i, plan_year in enumerate(result.input.timeline):
        fill = result.yearly_bracket_fill[i] if i < len(result.yearly_bracket_fill) else []
        conversion = result.yearly_conversions[i] if i < len(result.yearly_conversions) else 0
        years.append(
            {
                "year": plan_year.year,
                "income": round(sum(b.filled_by_income for b in fill)),
                "conversion": round(conversion),
                "segments": [
                    {"rate": b.bracket_rate, "amount": round(b.filled_by_conversion)}
                    for b in fill
                    if b.filled_by_conversion > 0.5
                ],
            }
        )
    return {"years": years}


def balance_view(result: OptimizationResult) -> dict:
    """Traditional balance with and without conversions, plus the headline numbers."""
    with_rmd = result.rmd_projection
    without_rmd = result.rmd_projection_no_conversion
    without_by_age = (
        {d.age: d.trad_balance_start for d in without_rmd.yearly_detail} if without_rmd else {}
    )
    points = [
        {
            "age": d.age,
            "year": d.year,
            "with": round(d.trad_balance_start),
            "without": round(without_by_age.get(d.age, 0)),
        }
        for d in (with_rmd.yearly_detail if with_rmd else [])
    ]
    return {
        "roth_at_retirement": round(result.roth_at_retirement),
        "peak_rmd_with": round(with_rmd.peak_rmd_amount) if with_rmd else None,
        "peak_rmd_without": round(without_rmd.peak_rmd_amount) if without_rmd else None,
        "after_tax_wealth_change": round(result.npv_at_optimal - result.npv_at_zero),
        "points": points,
    }


def result_view(result: OptimizationResult) -> dict:
    return {"bracket_fill": bracket_fill_view(result), "balances": balance_view(result)}
