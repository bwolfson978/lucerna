"""Display data for MCP App Views, derived from an engine result.

Views render shared components (ui/) that need chart series the model has no use for.
The server sends these in the tool result's ``_meta`` under ``VIEW_META_KEY``: hosts
pass ``_meta`` to the View but not to the model. The web app builds the same shapes
from full results (frontend/src/lib/results/viewData.ts); the shared fixture
shared/fixtures/view-data.json keeps the two in step.
"""

from __future__ import annotations

import math

from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
from app.engine.types import OptimizationResult

VIEW_META_KEY = "lucerna/view"


def _round(value: float) -> int:
    """JavaScript ``Math.round`` (halves round up), as the web app rounds the same data."""
    return math.floor(value + 0.5)


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
                "income": _round(plan_year.gross_income),
                "rmd": _round(rmd_by_year.get(plan_year.year, 0)),
                "conversion": _round(conversion),
                "tax": _round(sum(b.bracket_rate * b.filled_by_conversion for b in fill)),
            }
        )
    filing_status = result.input.filing_status
    brackets = [
        {
            "rate": b["rate"],
            "min": _round(b["min"]),
            "max": None if b["max"] == float("inf") else _round(b["max"]),
        }
        for b in BRACKETS[filing_status]
    ]
    return {
        "years": years,
        "brackets": brackets,
        "standard_deduction": _round(STANDARD_DEDUCTION[filing_status]),
    }


# Points the result card's slider gets from the conversion curve (about 200 points).
CURVE_VIEW_POINTS = 40


def curve_points(result: OptimizationResult) -> list:
    """The conversion curve points the card's slider uses: for each of CURVE_VIEW_POINTS + 1
    evenly spaced totals, the point nearest it (the lower one on a tie), plus the optimal
    schedule's own point. Picking from these again returns the same points, so the web
    app can repeat the pick on a stored result (frontend lib/results/viewData.ts)."""
    points = sorted(result.conversion_curve, key=lambda p: p.total_cap)
    if len(points) < 2:
        return []
    top = points[-1].total_cap
    chosen = set()
    for k in range(CURVE_VIEW_POINTS + 1):
        target = top * k / CURVE_VIEW_POINTS
        chosen.add(min(range(len(points)), key=lambda i: (abs(points[i].total_cap - target), i)))
    chosen.update(i for i, p in enumerate(points) if abs(p.total_cap - result.total_conversion) < 1)
    return [points[i] for i in sorted(chosen)]


def curve_view(result: OptimizationResult) -> dict | None:
    """What the card's slider needs to move off the optimal schedule: per point, the
    total converted, estimated savings (today's dollars, as the headline), total tax,
    and each year's conversion and required withdrawal. The card adds each year's tax
    from the brackets, as the results page does. None without a curve."""
    points = curve_points(result)
    if not points:
        return None
    return {
        "points": [
            {
                "total": _round(p.total_cap),
                "savings": _round(p.npv - result.npv_at_zero),
                "tax": _round(p.total_tax),
                "conversions": [_round(c) for c in p.yearly_conversions],
                "rmds": [_round(r) for r in p.yearly_rmd_amounts],
            }
            for p in points
        ]
    }


def result_view(result: OptimizationResult) -> dict:
    view = {"bracket_fill": bracket_fill_view(result)}
    curve = curve_view(result)
    if curve:
        view["curve"] = curve
    return view
