from app.engine.types import (
    ScenarioInput, ReasoningTrace, BracketFillResult, NPVCurvePoint,
)
from app.engine.tax import get_marginal_rate


def generate_reasoning_trace(
    scenario: ScenarioInput,
    optimal_conversions: list[float],
    bracket_fill: list[list[BracketFillResult]],
    npv_curve: list[NPVCurvePoint],
) -> ReasoningTrace:
    """Generate a structured reasoning trace for the AI explanation layer.

    Analyzes the optimization result and produces a human-readable explanation
    of why the optimal conversion amounts are what they are.
    """
    total_conversion = sum(optimal_conversions)
    n_years = len(optimal_conversions)

    # Find binding constraint
    binding_constraint = _find_binding_constraint(scenario, optimal_conversions, bracket_fill)

    # Marginal rates at optimal
    marginal_rates = []
    for t in range(n_years):
        income = scenario.income_trajectory[t].gross_income
        c_t = optimal_conversions[t]
        rate = get_marginal_rate(income + c_t, scenario.filing_status)
        marginal_rates.append(rate)

    avg_marginal = sum(marginal_rates) / len(marginal_rates) if marginal_rates else 0.0

    # NPV benefit
    npv_at_zero = npv_curve[0].npv if npv_curve else 0.0
    npv_at_optimal = max((p.npv for p in npv_curve), default=0.0)
    marginal_benefit = npv_at_optimal - npv_at_zero

    # Cost/benefit of brackets
    cost_of_next = _cost_of_next_bracket(scenario, optimal_conversions)
    benefit_of_current = _benefit_of_current_bracket(scenario, optimal_conversions)

    # Sensitivity notes
    sensitivity_notes = _build_sensitivity_notes(scenario, optimal_conversions)

    # Summary points
    summary_points = _build_summary_points(
        scenario, optimal_conversions, marginal_benefit
    )

    return ReasoningTrace(
        binding_constraint=binding_constraint,
        marginal_tax_rate_at_optimal=round(avg_marginal, 4),
        marginal_benefit_at_optimal=round(marginal_benefit, 2),
        cost_of_next_bracket=cost_of_next,
        benefit_of_current_bracket=benefit_of_current,
        sensitivity_notes=sensitivity_notes,
        summary_points=summary_points,
    )


def _find_binding_constraint(
    scenario: ScenarioInput,
    conversions: list[float],
    bracket_fill: list[list[BracketFillResult]],
) -> str:
    """Determine what's limiting the optimal conversion amount."""
    total = sum(conversions)
    if total >= scenario.traditional_ira_balance * 0.95:
        return "Traditional IRA balance fully converted"

    # Check if conversions are filling to a specific bracket boundary
    bracket_labels = []
    for t, fills in enumerate(bracket_fill):
        for fill in fills:
            if fill.filled_by_conversion > 0 and fill.remaining_capacity < 100:
                bracket_labels.append(f"{fill.bracket_rate:.0%}")

    if bracket_labels:
        most_common = max(set(bracket_labels), key=bracket_labels.count)
        years_hitting = sum(1 for l in bracket_labels if l == most_common)
        if years_hitting == 1:
            return f"Top of {most_common} bracket"
        return f"Top of {most_common} bracket in {years_hitting} years"

    return "Marginal cost exceeds marginal benefit of additional conversion"


def _cost_of_next_bracket(
    scenario: ScenarioInput,
    conversions: list[float],
) -> dict:
    """What would it cost to convert $1,000 more?"""
    from app.engine.tax import calculate_federal_tax

    extra = 1000
    total_extra_tax = 0.0
    for t in range(len(conversions)):
        income = scenario.income_trajectory[t].gross_income
        c_t = conversions[t]
        tax_current = calculate_federal_tax(income + c_t, scenario.filing_status)
        tax_extra = calculate_federal_tax(income + c_t + extra, scenario.filing_status)
        total_extra_tax += (tax_extra - tax_current)

    rate = get_marginal_rate(
        scenario.income_trajectory[0].gross_income + conversions[0] + extra,
        scenario.filing_status,
    )

    return {
        "bracket_rate": rate,
        "additional_tax": round(total_extra_tax, 2),
        "net_effect": f"Converting ${extra:,} more would cost ${total_extra_tax:,.0f} in additional tax at the {rate:.0%} rate",
    }


def _benefit_of_current_bracket(
    scenario: ScenarioInput,
    conversions: list[float],
) -> dict:
    """What benefit does the current conversion provide?"""
    from app.engine.tax import calculate_federal_tax

    total_tax_paid = 0.0
    for t in range(len(conversions)):
        income = scenario.income_trajectory[t].gross_income
        c_t = conversions[t]
        tax_with = calculate_federal_tax(income + c_t, scenario.filing_status)
        tax_without = calculate_federal_tax(income, scenario.filing_status)
        total_tax_paid += (tax_with - tax_without)

    total_conversion = sum(conversions)
    avg_rate = total_tax_paid / total_conversion if total_conversion > 0 else 0.0

    # Estimate future tax avoided (rough: retirement rate * conversion * growth)
    years_to_retire = scenario.retirement_age - scenario.age
    future_value = total_conversion * (1 + scenario.annual_growth_rate) ** years_to_retire
    retirement_rate = get_marginal_rate(
        scenario.annual_retirement_spending or future_value * 0.04,
        scenario.filing_status,
    )
    future_tax_avoided = future_value * retirement_rate

    return {
        "bracket_rate": round(avg_rate, 4),
        "tax_paid": round(total_tax_paid, 2),
        "future_tax_avoided": round(future_tax_avoided, 2),
    }


def _build_sensitivity_notes(
    scenario: ScenarioInput,
    conversions: list[float],
) -> list[str]:
    """Generate notes about what assumptions the result is sensitive to."""
    notes = []

    if scenario.annual_growth_rate > 0.08:
        notes.append("Result is sensitive to the assumed growth rate — a lower return reduces the benefit of conversion")
    elif scenario.annual_growth_rate < 0.05:
        notes.append("Conservative growth assumption — higher returns would increase conversion benefit")
    else:
        notes.append("Moderate growth assumption (7%) — result changes modestly with ±2% variation")

    n_years = len(conversions)
    if n_years > 1:
        incomes = [y.gross_income for y in scenario.income_trajectory]
        income_range = max(incomes) - min(incomes)
        if income_range > 50000:
            notes.append("Large income variation across years creates significant conversion opportunities in low-income years")

    if scenario.years_in_retirement >= 30:
        notes.append("Long retirement horizon amplifies the tax-free growth benefit of Roth conversions")

    return notes


def _build_summary_points(
    scenario: ScenarioInput,
    conversions: list[float],
    lifetime_savings: float,
) -> dict:
    """Build the summary explanation points."""
    total = sum(conversions)
    n_years = len(conversions)

    # Build per-year conversion description
    if n_years == 1:
        what = f"Convert ${total:,.0f} this year"
    else:
        year_parts = []
        for t in range(n_years):
            if conversions[t] > 0:
                year = scenario.income_trajectory[t].year
                year_parts.append(f"${conversions[t]:,.0f} in {year}")
        what = "Convert " + ", ".join(year_parts) if year_parts else "No conversion recommended"

    # Why this amount
    low_income_years = [
        scenario.income_trajectory[t].year
        for t in range(n_years)
        if conversions[t] > 0
    ]
    if low_income_years:
        why = f"Fills lower tax brackets during {'low-income years' if n_years > 1 else 'current income level'} without pushing into expensive higher brackets"
    else:
        why = "Current income already fills brackets efficiently"

    # How much saved
    how_much = f"Estimated ${abs(lifetime_savings):,.0f} in lifetime tax savings (in today's dollars)"

    # Key tradeoff
    key_tradeoff = (
        "Pay tax now at lower rates to avoid higher rates on forced withdrawals in retirement. "
        "Converting more enters higher brackets where the cost exceeds the benefit."
    )

    return {
        "what_to_convert": what,
        "why_this_amount": why,
        "how_much_you_save": how_much,
        "key_tradeoff": key_tradeoff,
    }
