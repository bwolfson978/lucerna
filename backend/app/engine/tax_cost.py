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


from app.engine.aca import calculate_subsidy_loss
from app.engine.state_tax import (
    calculate_state_tax,
    get_state_marginal_rate,
)
from app.engine.tax import calculate_federal_tax, get_marginal_rate
from app.engine.types import FilingStatus, HealthcareInput


def federal_tax_on_conversion(
    base_income: float,
    conversion: float,
    filing_status: FilingStatus,
) -> float:
    """Federal tax cost of converting `conversion` on top of `base_income`."""
    return calculate_federal_tax(base_income + conversion, filing_status) - calculate_federal_tax(
        base_income, filing_status
    )


def state_tax_on_conversion(
    base_income: float,
    conversion: float,
    state: str | None,
    filing_status: FilingStatus,
    custom_state_rate: float | None = None,
) -> float:
    """State tax cost of a conversion. Returns 0 if no state is provided."""
    if not state:
        return 0.0
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
) -> float:
    """Total marginal cost of a Roth conversion (federal + state + ACA subsidy loss)."""
    cost = federal_tax_on_conversion(base_income, conversion, filing_status)
    cost += state_tax_on_conversion(
        base_income, conversion, state, filing_status, custom_state_rate
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
) -> float:
    """Combined federal + state marginal rate at the given income + conversion level."""
    rate = get_marginal_rate(base_income + conversion, filing_status)
    if state:
        rate += get_state_marginal_rate(
            base_income + conversion,
            state,
            filing_status,
            custom_state_rate,
        )
    return rate
