"""Conversion curve generation strategies.

Provides a Protocol for curve strategies and a dispatch function that
reads the active strategy from a module-level constant.  Each strategy
produces list[ConversionCurvePoint] for a given scenario and budget range.

The shared ``build_curve_point`` helper delegates per-year tax, bracket fill,
and RMD computation to ``optimizer._build_year_detail`` — the same path used
for the authoritative OptimizationResult — so curve points are always
consistent with the main result and any future changes to the income model
propagate to the slider automatically.

Engine dependency order: types → tax → state_tax → heuristic → curve_strategy → optimizer
"""

from __future__ import annotations

from typing import Literal, Protocol

from app.engine.types import (
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

    Delegates to optimizer._build_year_detail for all per-year computation
    (RMD, effective income, tax cost, bracket fill, balance advance) so
    curve points always agree with the authoritative OptimizationResult.
    """
    from app.engine.optimizer import _build_year_detail, calculate_npv  # lazy — avoid circular

    npv_val = calculate_npv(scenario, yearly_conv)
    yearly_detail, yearly_bracket_fill, total_tax, _ = _build_year_detail(scenario, yearly_conv)
    yearly_rmd_amounts = [d["rmd"] for d in yearly_detail]

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
