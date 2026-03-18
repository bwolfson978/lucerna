from app.engine.types import ScenarioInput, FilingStatus
from app.engine.tax import BRACKETS, STANDARD_DEDUCTION, get_marginal_rate


def _estimate_retirement_rate(scenario: ScenarioInput) -> float:
    """Estimate the marginal tax rate during retirement withdrawals.

    Uses retirement spending to estimate the rate. For small balances where
    the 4% rule produces very low spending, uses at minimum the 22% bracket
    as a reasonable threshold — most people with meaningful IRA balances
    will withdraw enough to hit 12%+ in retirement.
    """
    spending = scenario.annual_retirement_spending
    if spending is None:
        total_balance = scenario.traditional_ira_balance + scenario.roth_ira_balance
        # Estimate retirement spending: balance grows to retirement, then 4% rule
        years_to_retire = max(1, scenario.retirement_age - scenario.age)
        future_balance = total_balance * (1 + scenario.annual_growth_rate) ** years_to_retire
        spending = future_balance * 0.04
    rate = get_marginal_rate(spending, scenario.filing_status)
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

    for year_info in scenario.income_trajectory:
        if remaining_balance <= 0:
            conversions.append(0.0)
            continue

        gross_income = year_info.gross_income
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
