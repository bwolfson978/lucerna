"""Conversion curve generation strategies.

Provides a Protocol for curve strategies and a dispatch function that
reads the active strategy from a module-level constant.  Each strategy
produces list[ConversionCurvePoint] for a given scenario and budget range.

The shared ``build_curve_point`` helper eliminates duplicated detail-building
code that previously existed in both ``extract_conversion_curve`` and
``extract_conversion_curve_3d``.

Engine dependency order: types → tax → state_tax → heuristic → curve_strategy → optimizer
"""

from __future__ import annotations

from typing import Literal, Protocol

from app.engine.types import (
    ScenarioInput,
    ConversionCurvePoint,
    BracketFillResult,
)
from app.engine.tax import (
    calculate_federal_tax,
    get_marginal_rate,
    analyze_bracket_fill,
)
from app.engine.state_tax import (
    calculate_state_tax,
    resolve_state_for_year,
)


# ── Strategy type ────────────────────────────────────────────────────

CurveStrategyName = Literal["dp_3d", "bracket_fill"]


class CurveStrategy(Protocol):
    """Protocol for conversion curve generation strategies.

    Any callable with this signature satisfies the protocol.  Existing
    functions like ``extract_conversion_curve_3d`` already conform (extra
    keyword arguments with defaults are compatible).
    """

    def __call__(
        self,
        scenario: ScenarioInput,
        *,
        n_curve_points: int = 200,
        curve_max: float | None = None,
    ) -> list[ConversionCurvePoint]: ...


# ── Active strategy (one-line swap) ─────────────────────────────────

DEFAULT_CURVE_STRATEGY: CurveStrategyName = "bracket_fill"


# ── Shared helper ────────────────────────────────────────────────────


def build_curve_point(
    scenario: ScenarioInput,
    cap_rounded: float,
    yearly_conv: list[float],
) -> ConversionCurvePoint:
    """Build a full ConversionCurvePoint from a yearly allocation.

    Computes NPV, bracket fill, yearly detail, and total tax.  Shared by
    all curve strategies so that output format is identical regardless of
    which strategy generated the allocation.
    """
    from app.engine.optimizer import calculate_npv  # lazy — avoid circular

    n_years = len(scenario.income_timeline)
    npv_val = calculate_npv(scenario, yearly_conv)

    yearly_bracket_fill: list[list[BracketFillResult]] = []
    yearly_detail: list[dict] = []
    total_tax = 0.0

    for i in range(n_years):
        income = scenario.income_timeline[i].gross_income
        c = yearly_conv[i]

        tax_with = calculate_federal_tax(income + c, scenario.filing_status)
        tax_without = calculate_federal_tax(income, scenario.filing_status)
        tax_cost = tax_with - tax_without

        yr_state = resolve_state_for_year(
            scenario.income_timeline[i].state, scenario.state
        )
        if yr_state:
            st_with = calculate_state_tax(
                income + c, yr_state, scenario.filing_status,
                scenario.custom_state_rate,
            )
            st_without = calculate_state_tax(
                income, yr_state, scenario.filing_status,
                scenario.custom_state_rate,
            )
            tax_cost += st_with - st_without

        total_tax += tax_cost

        eff_rate = tax_cost / c if c > 0 else 0.0
        marginal = get_marginal_rate(income + c, scenario.filing_status)

        yearly_detail.append({
            "year": scenario.income_timeline[i].year,
            "income": income,
            "conversion": c,
            "tax_cost": round(tax_cost, 2),
            "effective_rate": round(eff_rate, 4),
            "marginal_bracket": f"{marginal:.0%}",
        })
        yearly_bracket_fill.append(
            analyze_bracket_fill(income, c, scenario.filing_status)
        )

    return ConversionCurvePoint(
        total_cap=cap_rounded,
        yearly_conversions=yearly_conv,
        yearly_bracket_fill=yearly_bracket_fill,
        yearly_detail=yearly_detail,
        total_tax=round(total_tax, 2),
        npv=round(npv_val, 2),
    )


# ── Strategy registry & dispatch ────────────────────────────────────


def _get_strategy(name: CurveStrategyName) -> CurveStrategy:
    """Return the curve strategy function for a given name.

    Uses lazy imports to avoid circular dependencies.
    """
    if name == "dp_3d":
        from app.engine.dp import extract_conversion_curve_3d
        return extract_conversion_curve_3d  # type: ignore[return-value]
    if name == "bracket_fill":
        from app.engine.heuristic import bracket_fill_curve
        return bracket_fill_curve  # type: ignore[return-value]
    raise ValueError(f"Unknown curve strategy: {name!r}")


def generate_conversion_curve(
    scenario: ScenarioInput,
    *,
    n_curve_points: int = 200,
    curve_max: float | None = None,
    strategy: CurveStrategyName | None = None,
) -> list[ConversionCurvePoint]:
    """Generate the conversion curve using the active strategy.

    Args:
        scenario: The optimization scenario.
        n_curve_points: Number of output curve points.
        curve_max: Upper bound for the budget range.
        strategy: Override the module default.  If None, uses
                  DEFAULT_CURVE_STRATEGY.
    """
    name = strategy or DEFAULT_CURVE_STRATEGY
    fn = _get_strategy(name)
    return fn(scenario, n_curve_points=n_curve_points, curve_max=curve_max)
