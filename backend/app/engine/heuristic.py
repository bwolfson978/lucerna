from __future__ import annotations

import numpy as np

from app.engine.constants import RETIREMENT_SPENDING_RATE, round_to_resolution
from app.engine.rmd import calculate_rmd, rmd_start_age
from app.engine.state_tax import get_state_marginal_rate
from app.engine.tax import BRACKETS, STANDARD_DEDUCTION, get_marginal_rate
from app.engine.types import ConversionCurvePoint, ScenarioInput


def _estimate_retirement_rate(scenario: ScenarioInput) -> float:
    """Estimate the combined marginal tax rate during retirement withdrawals.

    Uses retirement spending to estimate the federal rate, then adds the
    state marginal rate at retirement (if state tax is modeled). For small
    balances where the 4% rule produces very low spending, uses at minimum
    the 22% bracket as a reasonable threshold.
    """
    spending = scenario.default_drawdown
    if spending is None:
        total_balance = scenario.traditional_ira_balance + scenario.roth_ira_balance
        # Estimate retirement spending: balance grows to retirement, then 4% rule
        years_to_retire = max(0, scenario.drawdown_start_age - scenario.age)
        future_balance = total_balance * (1 + scenario.annual_growth_rate) ** max(
            1, years_to_retire
        )
        spending = future_balance * RETIREMENT_SPENDING_RATE
    rate = get_marginal_rate(spending, scenario.filing_status)

    # Add retirement state marginal rate if applicable
    ret_state = scenario.retirement_state or scenario.state
    if ret_state:
        rate += get_state_marginal_rate(
            spending, ret_state, scenario.filing_status, scenario.custom_state_rate
        )

    return rate


def greedy_bracket_fill(scenario: ScenarioInput) -> list[float]:
    """Greedy bracket-fill heuristic: fill brackets up to the retirement rate.

    For each year, calculates the conversion that fills brackets up to the
    point where the marginal rate would exceed the expected retirement
    withdrawal rate. Respects the remaining traditional balance constraint.

    This serves as both:
    - The starting point for scipy optimization
    - The fallback if scipy doesn't converge
    """
    retirement_rate = _estimate_retirement_rate(scenario)
    brackets = BRACKETS[scenario.filing_status]
    deduction = STANDARD_DEDUCTION[scenario.filing_status]

    remaining_balance = scenario.traditional_ira_balance
    conversions: list[float] = []
    owner_rmd_start = rmd_start_age(scenario.age)

    for t, year_info in enumerate(scenario.timeline):
        if remaining_balance <= 0:
            conversions.append(0.0)
            continue

        gross_income = year_info.gross_income
        owner_age = scenario.age + t  # where t is loop index
        if owner_age >= owner_rmd_start:
            expected_rmd = calculate_rmd(remaining_balance, owner_age)
            taxable_income = max(0, gross_income + expected_rmd - deduction)
        else:
            taxable_income = max(0, gross_income - deduction)

        # Find how much room there is in brackets up to and including the retirement rate
        fill_target = 0.0
        for bracket in brackets:
            if bracket["rate"] > retirement_rate:
                break
            bracket_top = bracket["max"]
            if bracket_top == float("inf"):
                break
            if taxable_income >= bracket_top:
                continue
            # Room in this bracket
            room = bracket_top - max(taxable_income, bracket["min"])
            fill_target += room

        conversion = min(fill_target, remaining_balance)
        conversion = max(0.0, conversion)
        conversions.append(conversion)
        remaining_balance -= conversion

    return conversions


# ---------------------------------------------------------------------------
# Global bracket-fill: cheapest slots first across all years
# ---------------------------------------------------------------------------


def _global_bracket_fill_for_cap(
    scenario: ScenarioInput,
    total_cap: float,
) -> list[float]:
    """Allocate *total_cap* across years by filling cheapest bracket slots first.

    Enumerates all available bracket capacity across every timeline year,
    sorts by ``(rate, year)``, and fills greedily from cheapest to most
    expensive until the budget is exhausted.

    Returns yearly conversion amounts (``list[float]``).
    """
    n_years = len(scenario.timeline)
    if total_cap <= 0 or n_years == 0:
        return [0.0] * n_years

    brackets = BRACKETS[scenario.filing_status]
    deduction = STANDARD_DEDUCTION[scenario.filing_status]
    g = scenario.annual_growth_rate

    # Pre-compute balance available at each year if nothing else is converted
    # before it.  The real constraint is sequential, enforced after filling.
    year_balance_cap = []
    bal = scenario.traditional_ira_balance
    for _ in range(n_years):
        year_balance_cap.append(bal)
        bal *= 1 + g

    # Build (rate, year, room) slots
    slots: list[tuple[float, int, float]] = []
    for t in range(n_years):
        income = scenario.timeline[t].gross_income
        owner_age = scenario.age + t
        owner_rmd_start = rmd_start_age(scenario.age)
        if owner_age >= owner_rmd_start:
            expected_rmd = calculate_rmd(scenario.traditional_ira_balance, owner_age)
            taxable = max(0, income + expected_rmd - deduction)
        else:
            taxable = max(0, income - deduction)

        for bracket in brackets:
            rate = bracket["rate"]
            b_min = bracket["min"]
            b_max = bracket["max"]

            if b_max == float("inf"):
                # Cap top bracket room at IRA balance (generous bound)
                b_max = b_min + scenario.traditional_ira_balance
            if taxable >= b_max:
                continue

            room = b_max - max(taxable, b_min)
            if room > 0:
                slots.append((rate, t, room))

    # Sort: cheapest rate first, then earliest year
    slots.sort()

    # Fill slots greedily
    conversions = [0.0] * n_years
    remaining_budget = total_cap

    for _rate, t, room in slots:
        if remaining_budget <= 0:
            break
        fill = min(room, remaining_budget)
        conversions[t] += fill
        remaining_budget -= fill

    # Enforce sequential balance constraint (with inter-year growth)
    remaining_bal = scenario.traditional_ira_balance
    for i in range(n_years):
        conversions[i] = max(0.0, min(conversions[i], remaining_bal))
        remaining_bal = (remaining_bal - conversions[i]) * (1 + g)

    return conversions


def bracket_fill_curve(
    scenario: ScenarioInput,
    *,
    n_curve_points: int = 200,
    curve_max: float | None = None,
) -> list[ConversionCurvePoint]:
    """Build a conversion curve using the global bracket-fill heuristic.

    For each total-conversion cap, fills cheapest bracket slots first
    across all years (sorted by rate, then year).  Complexity is
    O(points × years × brackets) — much cheaper than the 3D DP approach.

    Signature conforms to the :class:`CurveStrategy` protocol.
    """
    from app.engine.curve_strategy import build_curve_point  # lazy — avoid circular

    balance = scenario.traditional_ira_balance
    n_years = len(scenario.timeline)

    if balance <= 0 or n_years == 0:
        return []

    upper = max(balance, curve_max or balance)
    output_caps = np.linspace(0, upper, n_curve_points)
    points: list[ConversionCurvePoint] = []

    for cap in output_caps:
        cap_rounded = round_to_resolution(float(cap))

        if cap_rounded <= 0:
            yearly_conv = [0.0] * n_years
        else:
            yearly_conv = _global_bracket_fill_for_cap(scenario, cap_rounded)

        points.append(build_curve_point(scenario, cap_rounded, yearly_conv))

    return points
