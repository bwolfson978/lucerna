"""Unified conversion tax cost calculations.

Eliminates the duplicated pattern of computing
  tax(income + conversion) - tax(income)
that previously appeared in optimizer.py, dp.py, curve_strategy.py, trace.py,
and aca.py. All modules now call through this single module for conversion
cost calculations.
"""

__all__ = [
    "federal_tax_on_conversion",
    "state_tax_on_conversion",
    "total_conversion_cost",
    "combined_marginal_rate",
]


from dataclasses import replace

from app.engine.aca import calculate_subsidy_loss
from app.engine.state_tax import (
    calculate_state_tax,
    get_state_marginal_rate,
)
from app.engine.tax import calculate_federal_tax, get_marginal_rate
from app.engine.types import FilingStatus, HealthcareInput
from app.engine.year_tax import YearTax

# Every function takes an optional ``year``: the timeline year's YearTax, which
# taxes only the taxable part of Social Security and applies the 65+ deduction.
# Without it, incomes are taxed as ordinary income in full.


def federal_tax_on_conversion(
    base_income: float,
    conversion: float,
    filing_status: FilingStatus,
    year: YearTax | None = None,
) -> float:
    """Federal tax cost of converting `conversion` on top of `base_income`."""
    if year is not None:
        return year.federal(base_income + conversion) - year.federal(base_income)
    return calculate_federal_tax(base_income + conversion, filing_status) - calculate_federal_tax(
        base_income, filing_status
    )


def state_tax_on_conversion(
    base_income: float,
    conversion: float,
    state: str | None,
    filing_status: FilingStatus,
    custom_state_rate: float | None = None,
    year: YearTax | None = None,
) -> float:
    """State tax cost of a conversion. Returns 0 if no state is provided."""
    if not state:
        return 0.0
    if year is not None:
        year = replace(year, state=state, custom_state_rate=custom_state_rate)
        return year.state_tax(base_income + conversion) - year.state_tax(base_income)
    return calculate_state_tax(
        base_income + conversion, state, filing_status, custom_state_rate
    ) - calculate_state_tax(base_income, state, filing_status, custom_state_rate)


def total_conversion_cost(
    base_income: float,
    conversion: float,
    filing_status: FilingStatus,
    state: str | None = None,
    custom_state_rate: float | None = None,
    healthcare: HealthcareInput | None = None,
    is_aca_year: bool = False,
    year: YearTax | None = None,
) -> float:
    """Total marginal cost of a Roth conversion (federal + state + ACA subsidy loss)."""
    cost = federal_tax_on_conversion(base_income, conversion, filing_status, year)
    cost += state_tax_on_conversion(
        base_income, conversion, state, filing_status, custom_state_rate, year
    )

    if healthcare and is_aca_year and conversion > 0:
        cost += calculate_subsidy_loss(
            base_income,
            conversion,
            healthcare.household_size,
            healthcare.monthly_slcsp_premium,
        )

    return cost


def combined_marginal_rate(
    base_income: float,
    conversion: float,
    filing_status: FilingStatus,
    state: str | None = None,
    custom_state_rate: float | None = None,
    year: YearTax | None = None,
) -> float:
    """Combined federal + state marginal rate at the given income + conversion level."""
    income = base_income + conversion
    if year is not None:
        rate = year.federal_bracket(income)
        income = replace(year, state=state).state_income(income)
    else:
        rate = get_marginal_rate(income, filing_status)
    if state:
        rate += get_state_marginal_rate(
            income,
            state,
            filing_status,
            custom_state_rate,
            year.fixed_scale if year is not None else 1.0,
        )
    return rate
