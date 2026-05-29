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

from app.engine.state_tax import resolve_state_for_year
from app.engine.tax import (
    analyze_bracket_fill,
    get_marginal_rate,
)
from app.engine.tax_cost import (
    federal_tax_on_conversion,
    state_tax_on_conversion,
)
from app.engine.types import (
    BracketFillResult,
    ConversionCurvePoint,
    ScenarioInput,
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

    n_years = len(scenario.timeline)
    npv_val = calculate_npv(scenario, yearly_conv)

    yearly_bracket_fill: list[list[BracketFillResult]] = []
    yearly_detail: list[dict] = []
    total_tax = 0.0

    for i in range(n_years):
        income = scenario.timeline[i].gross_income
        c = yearly_conv[i]
        yr_state = resolve_state_for_year(scenario.timeline[i].state, scenario.state)

        tax_cost = federal_tax_on_conversion(income, c, scenario.filing_status)
        tax_cost += state_tax_on_conversion(
            income,
            c,
            yr_state,
            scenario.filing_status,
            scenario.custom_state_rate,
        )
        total_tax += tax_cost

        eff_rate = tax_cost / c if c > 0 else 0.0
        marginal = get_marginal_rate(income + c, scenario.filing_status)

        yearly_detail.append(
            {
                "year": scenario.timeline[i].year,
                "income": income,
                "conversion": c,
                "tax_cost": round(tax_cost, 2),
                "effective_rate": round(eff_rate, 4),
                "marginal_bracket": f"{marginal:.0%}",
            }
        )
        yearly_bracket_fill.append(analyze_bracket_fill(income, c, scenario.filing_status))

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
