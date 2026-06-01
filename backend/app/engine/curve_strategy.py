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

from app.engine.rmd import calculate_rmd, rmd_start_age
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

    Mirrors the logic in optimizer._build_year_detail: RMDs are included
    in the effective income base so that tax cost, bracket fill, and marginal
    rate reflect the true marginal position of the conversion (i.e. conversion
    is layered on top of income + RMD, not just income).
    """
    from app.engine.optimizer import calculate_npv  # lazy — avoid circular

    npv_val = calculate_npv(scenario, yearly_conv)

    owner_rmd_start = rmd_start_age(scenario.age)
    trad_balance = scenario.traditional_ira_balance

    yearly_bracket_fill: list[list[BracketFillResult]] = []
    yearly_detail: list[dict] = []
    yearly_rmd_amounts: list[float] = []
    total_tax = 0.0

    for i, entry in enumerate(scenario.timeline):
        income = entry.gross_income
        c = yearly_conv[i]
        yr_state = resolve_state_for_year(entry.state, scenario.state)
        owner_age = scenario.age + i

        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, trad_balance)
        yearly_rmd_amounts.append(round(rmd, 2))
        effective_income = income + rmd

        tax_cost = federal_tax_on_conversion(effective_income, c, scenario.filing_status)
        tax_cost += state_tax_on_conversion(
            effective_income,
            c,
            yr_state,
            scenario.filing_status,
            scenario.custom_state_rate,
        )
        total_tax += tax_cost

        eff_rate = tax_cost / c if c > 0 else 0.0
        marginal = get_marginal_rate(effective_income + c, scenario.filing_status)

        yearly_detail.append(
            {
                "year": entry.year,
                "income": income,
                "rmd": round(rmd, 2),
                "conversion": c,
                "tax_cost": round(tax_cost, 2),
                "effective_rate": round(eff_rate, 4),
                "marginal_bracket": f"{marginal:.0%}",
            }
        )
        yearly_bracket_fill.append(analyze_bracket_fill(effective_income, c, scenario.filing_status))

        # Advance balance for next iteration
        available_for_conv = max(0.0, trad_balance - rmd)
        actual_conv = min(max(0.0, c), available_for_conv)
        trad_balance -= rmd
        trad_balance -= actual_conv
        if entry.drawdown is not None and entry.drawdown > 0:
            trad_balance -= min(float(entry.drawdown), trad_balance)
        trad_balance *= 1 + scenario.annual_growth_rate

    return ConversionCurvePoint(
        total_cap=cap_rounded,
        yearly_conversions=yearly_conv,
        yearly_bracket_fill=yearly_bracket_fill,
        yearly_detail=yearly_detail,
        total_tax=round(total_tax, 2),
        npv=round(npv_val, 2),
        yearly_rmd_amounts=yearly_rmd_amounts,
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
