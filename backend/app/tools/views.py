"""Display data for MCP App Views, derived from an engine result.

Views render shared components (ui/) that need chart series the model has no use for.
The server sends these in the tool result's ``_meta`` under ``VIEW_META_KEY``: hosts
pass ``_meta`` to the View but not to the model. The web app's own cards and results
page read the same data, sent with each full result (``browser_result``).
"""

from __future__ import annotations

import math

from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
from app.engine.types import OptimizationResult, ScenarioInput
from app.engine.year_tax import year_tax
from app.tools import core

VIEW_META_KEY = "lucerna/view"
# Key on a full result handed to the web app, holding its ``result_display``.
DISPLAY_KEY = "display"


def _round(value: float) -> int:
    """JavaScript ``Math.round`` (halves round up), as the web app rounds the same data."""
    return math.floor(value + 0.5)


def _bar(
    scenario: ScenarioInput, t: int, detail: dict, rmd: float, conversion: float
) -> dict[str, float]:
    """One year's bar in the bracket chart: what the engine taxes that year, by where it
    comes from, so the bar ends at the engine's taxable income plus the standard deduction.

    The engine measures a conversion on top of everything else taxed that year: income
    from outside the accounts, the required withdrawal and the traditional withdrawal
    that funds spending. Only the taxable part of Social Security counts, and it grows
    with the year's other income, conversion included. From 65 the deductions are larger
    than the standard one the chart draws as its 0% band; the chart takes that extra off
    the bottom of the bar.
    """
    year = year_tax(scenario, t)
    income = scenario.timeline[t].gross_income
    withdrawal = detail.get("spending_from_traditional", 0.0)
    untaxed_benefits, extra_deduction = year.federal_adjustments(
        income + rmd + withdrawal + conversion
    )
    return {
        "income": income - year.social_security,
        "withdrawal": withdrawal,
        "taxable_social_security": year.social_security - untaxed_benefits,
        "extra_deduction": extra_deduction,
    }


def bracket_fill_view(result: OptimizationResult) -> dict:
    """The tax bracket chart (ui/src/BracketChart.tsx) as the results page draws it at the
    optimal schedule: per year, what is taxed by where it comes from (see ``_bar``), the
    conversion, all the tax it adds (federal and state, as the engine counts it) and what
    pays that tax (``tax_from``), plus the brackets (taxable income, ``max`` None for the
    top one) and standard deduction for the filing status."""
    rmd_by_year = (
        {d.year: d.rmd_amount for d in result.rmd_projection.yearly_detail}
        if result.rmd_projection
        else {}
    )
    years = []
    for i, plan_year in enumerate(result.input.timeline):
        fill = result.yearly_bracket_fill[i] if i < len(result.yearly_bracket_fill) else []
        conversion = result.yearly_conversions[i] if i < len(result.yearly_conversions) else 0
        detail = result.yearly_detail[i] if i < len(result.yearly_detail) else {}
        rmd = rmd_by_year.get(plan_year.year, 0)
        bar = _bar(result.input, i, detail, rmd, conversion)
        years.append(
            {
                "year": plan_year.year,
                "age": result.input.age + i,
                "income": _round(bar["income"]),
                "rmd": _round(rmd),
                "withdrawal": _round(bar["withdrawal"]),
                "taxable_social_security": _round(bar["taxable_social_security"]),
                "conversion": _round(conversion),
                "extra_deduction": _round(bar["extra_deduction"]),
                "tax": _round(_year_tax(detail, fill)),
                **_tax_from(detail),
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


def _tax_from(detail: dict) -> dict:
    """What pays a year's conversion tax: income while the household is working, the
    accounts once they fund its spending. Left out for results saved before the engine
    recorded a year's spending."""
    if "spending" not in detail:
        return {}
    return {"tax_from": "income" if detail["spending"] is None else "accounts"}


def _year_tax(detail: dict, fill: list) -> float:
    """The tax a year's conversion adds: the engine's figure (federal and state), or for a
    result without one, the federal tax from the bracket fill."""
    if "tax_cost" in detail:
        return detail["tax_cost"]
    return sum(b.bracket_rate * b.filled_by_conversion for b in fill)


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
    and each year's conversion, required withdrawal and tax (federal and state, adding up
    to the total), with the parts of the year's bar that change with the amount converted
    (see ``_bar``). None without a curve."""
    points = curve_points(result)
    if not points:
        return None
    view = []
    for p in points:
        bars = [
            _bar(result.input, t, detail, rmd, conversion)
            for t, (detail, rmd, conversion) in enumerate(
                zip(p.yearly_detail, p.yearly_rmd_amounts, p.yearly_conversions, strict=False)
            )
        ]
        view.append(
            {
                "total": _round(p.total_cap),
                "savings": _round(p.npv - result.npv_at_zero),
                "tax": _round(p.total_tax),
                "conversions": [_round(c) for c in p.yearly_conversions],
                "rmds": [_round(r) for r in p.yearly_rmd_amounts],
                "withdrawals": [_round(b["withdrawal"]) for b in bars],
                "taxable_social_security": [_round(b["taxable_social_security"]) for b in bars],
                "extra_deductions": [_round(b["extra_deduction"]) for b in bars],
                "taxes": [_round(d.get("tax_cost", 0)) for d in p.yearly_detail],
            }
        )
    return {"points": view}


def result_view(result: OptimizationResult) -> dict:
    view = {"bracket_fill": bracket_fill_view(result)}
    curve = curve_view(result)
    if curve:
        view["curve"] = curve
    return view


def result_display(result: OptimizationResult, result_id: str) -> dict:
    """What the shared result card shows for a result: the analyze tool's
    structuredContent (``card``) and View ``_meta`` (``view``), built here once. The web
    app gets it with every full result (``browser_result``) and renders its own cards and
    results page from it, so it never rebuilds this data in the browser."""
    return {"card": core.summarize_result(result, result_id), "view": result_view(result)}


def browser_result(result: OptimizationResult, result_id: str) -> dict:
    """A full engine result as the web app receives it: the result plus its display data,
    without the conversion curve. The curve is megabytes; the slider reads the few points
    in the display data instead."""
    return {
        **result.model_dump(mode="json", exclude={"conversion_curve"}),
        "conversion_curve": [],
        DISPLAY_KEY: result_display(result, result_id),
    }
