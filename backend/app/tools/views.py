"""Display data for MCP App Views, derived from an engine result.

Views render shared components (ui/) that need chart series the model has no use for.
The server sends these in the tool result's ``_meta`` under ``VIEW_META_KEY``: hosts
pass ``_meta`` to the View but not to the model. The web app builds the same shapes
from full results (frontend/src/lib/results/viewData.ts); the shared fixture
shared/fixtures/view-data.json keeps the two in step.
"""

from __future__ import annotations

from app.engine.tax import BRACKETS
from app.engine.types import OptimizationResult

VIEW_META_KEY = "lucerna/view"


def bracket_fill_view(result: OptimizationResult) -> dict:
    """Per year: other taxable income, the conversion, and the brackets it fills. Also the
    bracket schedule (taxable income, ``max`` None for the top bracket) for the
    chart's bracket lines and remaining space."""
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
    brackets = [
        {
            "rate": b["rate"],
            "min": round(b["min"]),
            "max": None if b["max"] == float("inf") else round(b["max"]),
        }
        for b in BRACKETS[result.input.filing_status]
    ]
    return {"years": years, "brackets": brackets}


def result_view(result: OptimizationResult) -> dict:
    return {"bracket_fill": bracket_fill_view(result)}
