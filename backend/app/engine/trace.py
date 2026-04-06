from app.engine.types import (
    ScenarioInput, ReasoningTrace, BracketFillResult, NPVCurvePoint,
    AcaSubsidyDetail,
)
from app.engine.tax import get_marginal_rate
from app.engine.state_tax import get_state_marginal_rate, resolve_state_for_year


def generate_reasoning_trace(
    scenario: ScenarioInput,
    optimal_conversions: list[float],
    bracket_fill: list[list[BracketFillResult]],
    npv_curve: list[NPVCurvePoint],
    aca_details: list[AcaSubsidyDetail] | None = None,
) -> ReasoningTrace:
    """Generate a structured reasoning trace for the AI explanation layer.

    Analyzes the optimization result and produces a human-readable explanation
    of why the optimal conversion amounts are what they are.
    """
    total_conversion = sum(optimal_conversions)
    n_years = len(optimal_conversions)

    # Find binding constraint
    binding_constraint = _find_binding_constraint(scenario, optimal_conversions, bracket_fill)

    # Marginal rates at optimal (combined federal + state)
    marginal_rates = []
    for t in range(n_years):
        income = scenario.income_trajectory[t].gross_income
        c_t = optimal_conversions[t]
        rate = get_marginal_rate(income + c_t, scenario.filing_status)
        yr_state = resolve_state_for_year(
            scenario.income_trajectory[t].state, scenario.state
        )
        if yr_state:
            rate += get_state_marginal_rate(
                income + c_t, yr_state, scenario.filing_status, scenario.custom_state_rate
            )
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

    # ACA impact analysis
    aca_impact = None
    aca_summary = None
    if aca_details:
        aca_impact = aca_details
        aca_summary = _build_aca_summary(scenario, aca_details, optimal_conversions)

    return ReasoningTrace(
        binding_constraint=binding_constraint,
        marginal_tax_rate_at_optimal=round(avg_marginal, 4),
        marginal_benefit_at_optimal=round(marginal_benefit, 2),
        cost_of_next_bracket=cost_of_next,
        benefit_of_current_bracket=benefit_of_current,
        sensitivity_notes=sensitivity_notes,
        summary_points=summary_points,
        aca_impact=aca_impact,
        aca_summary=aca_summary,
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
    years_to_retire = max(0, scenario.retirement_age - scenario.age)
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

    if scenario.healthcare:
        notes.append(
            "ACA subsidy impact is included — the true cost of each conversion dollar "
            "accounts for both federal tax and any reduction in your marketplace premium subsidy"
        )

    if scenario.state and scenario.state != "none":
        # Find the average state marginal rate across conversion years
        state_rates = []
        for t in range(len(conversions)):
            if conversions[t] > 0:
                yr_state = resolve_state_for_year(
                    scenario.income_trajectory[t].state, scenario.state
                )
                if yr_state:
                    income = scenario.income_trajectory[t].gross_income
                    sr = get_state_marginal_rate(
                        income + conversions[t], yr_state, scenario.filing_status,
                        scenario.custom_state_rate,
                    )
                    state_rates.append(sr)
        if state_rates:
            avg_state = sum(state_rates) / len(state_rates)
            notes.append(
                f"State income tax adds approximately {avg_state:.1%} marginal cost "
                f"to conversions — combined federal + state rates are used in optimization"
            )

    return notes


def _build_aca_summary(
    scenario: ScenarioInput,
    aca_details: list[AcaSubsidyDetail],
    conversions: list[float],
) -> dict:
    """Build a human-readable summary of the ACA subsidy impact."""
    total_subsidy_lost = sum(d.subsidy_lost for d in aca_details)
    total_federal_tax = sum(d.federal_tax_cost for d in aca_details)
    total_combined = sum(d.combined_cost for d in aca_details)
    total_conversion = sum(conversions)

    years_with_loss = [d for d in aca_details if d.subsidy_lost > 0]
    years_hitting_cliff = [d for d in aca_details if d.hits_cliff]

    # Find the year with the highest combined marginal rate
    worst_year = max(aca_details, key=lambda d: d.combined_marginal_rate) if aca_details else None

    summary: dict = {
        "total_subsidy_lost": round(total_subsidy_lost, 2),
        "total_federal_tax": round(total_federal_tax, 2),
        "total_combined_cost": round(total_combined, 2),
        "effective_combined_rate": round(total_combined / total_conversion, 4) if total_conversion > 0 else 0.0,
        "years_with_subsidy_loss": len(years_with_loss),
        "years_hitting_cliff": len(years_hitting_cliff),
    }

    # Plain-English explanation for the AI layer
    if total_subsidy_lost == 0:
        summary["explanation"] = (
            "The recommended conversions do not affect your ACA marketplace subsidy. "
            "Your income with conversions stays within a range where the subsidy remains unchanged."
        )
    elif years_hitting_cliff:
        cliff_years = ", ".join(str(d.year) for d in years_hitting_cliff)
        summary["explanation"] = (
            f"In {cliff_years}, the conversion would push your income above 400% of the "
            f"federal poverty level, eliminating your ACA subsidy entirely. The optimizer "
            f"accounts for this by limiting conversions in those years."
        )
    else:
        summary["explanation"] = (
            f"The recommended conversions reduce your ACA subsidy by "
            f"${total_subsidy_lost:,.0f} total across {len(years_with_loss)} year(s). "
            f"This subsidy loss is factored into the optimization — the recommended "
            f"conversion amounts already balance tax savings against subsidy cost."
        )

    if worst_year and worst_year.combined_marginal_rate > 0:
        summary["worst_year_note"] = (
            f"In {worst_year.year}, each dollar converted has a combined cost of "
            f"{worst_year.combined_marginal_rate:.0%} (federal tax + subsidy reduction)"
        )

    return summary


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
