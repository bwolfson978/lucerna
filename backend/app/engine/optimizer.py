import numpy as np
from scipy.optimize import minimize

from app.engine.types import (
    ScenarioInput, OptimizationResult, ScenarioComparison,
    NPVCurvePoint, BracketFillResult, ConversionCurvePoint,
    ConversionPreferences, AcaSubsidyDetail,
    RmdYearDetail, RmdProjection,
)
from app.engine.tax import calculate_federal_tax, get_marginal_rate, analyze_bracket_fill
from app.engine.heuristic import greedy_bracket_fill
from app.engine.aca import calculate_aca_subsidy, find_subsidy_cliff_income
from app.engine.state_tax import calculate_state_tax, resolve_state_for_year
from app.engine.rmd import rmd_start_age, calculate_rmd
from app.engine.tax_cost import (
    federal_tax_on_conversion,
    state_tax_on_conversion,
    total_conversion_cost,
    combined_marginal_rate,
)
from app.engine.constants import (
    ROUNDING_RESOLUTION,
    RETIREMENT_SPENDING_RATE,
    IMPROVEMENT_THRESHOLD,
    round_to_resolution,
)


def _aca_coverage_years(scenario: ScenarioInput) -> set[int]:
    """Determine which calendar years the user needs ACA marketplace coverage.

    If healthcare inputs specify explicit years, use those. If
    has_employer_coverage_after is set, only model ACA for years before it.
    Otherwise, defaults to all timeline years (conservative — optimizer
    will find the right balance).
    """
    hc = scenario.healthcare
    if hc is None:
        return set()

    timeline_years = {y.year for y in scenario.income_timeline}

    if hc.aca_coverage_years is not None:
        return set(hc.aca_coverage_years) & timeline_years

    if hc.has_employer_coverage_after is not None:
        return {y for y in timeline_years if y < hc.has_employer_coverage_after}

    return timeline_years


def calculate_npv(scenario: ScenarioInput, yearly_conversions: list[float]) -> float:
    """Calculate NPV for a given multi-year conversion schedule.

    Model phases:
    1. Conversion years: pay tax on conversions, shift balances, grow
    2. Post-timeline growth: grow both accounts until retirement
    3. Retirement: withdraw from traditional (taxed), Roth grows tax-free
    4. Terminal liquidation: remaining balances distributed

    When healthcare inputs are provided, subsidy loss from conversions
    is included as an additional cost in Phase 1.
    """
    n_years = len(scenario.income_timeline)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    filing_status = scenario.filing_status

    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance
    npv = 0.0

    # Determine ACA coverage years
    aca_years = _aca_coverage_years(scenario)
    hc = scenario.healthcare

    # Phase 1: Conversion years
    for t in range(n_years):
        income = scenario.income_timeline[t].gross_income
        conversion = min(max(0, yearly_conversions[t]), trad_balance)
        year_state = resolve_state_for_year(
            scenario.income_timeline[t].state, scenario.state
        )
        is_aca_year = hc is not None and scenario.income_timeline[t].year in aca_years

        cost = total_conversion_cost(
            income, conversion, filing_status,
            state=year_state,
            custom_state_rate=scenario.custom_state_rate,
            healthcare=hc if is_aca_year else None,
            is_aca_year=is_aca_year,
        )

        discount_factor = (1 + d) ** (-t)
        npv -= cost * discount_factor

        # Shift balances
        trad_balance -= conversion
        roth_balance += conversion

        # Grow both accounts
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

    # Phase 2: Post-timeline growth until retirement
    years_until_retirement = max(0, scenario.retirement_age - scenario.age)
    remaining_growth_years = years_until_retirement - n_years
    if remaining_growth_years > 0:
        growth_factor = (1 + g) ** remaining_growth_years
        trad_balance *= growth_factor
        roth_balance *= growth_factor

    # Phase 3: Retirement distributions (with RMD enforcement)
    spending = scenario.annual_retirement_spending
    if spending is None:
        spending = (trad_balance + roth_balance) * RETIREMENT_SPENDING_RATE

    # Resolve retirement state for Phase 3 and 4
    ret_state = scenario.retirement_state or scenario.state

    # RMD parameters
    owner_rmd_start = rmd_start_age(scenario.age)

    for year in range(years_until_retirement + 1,
                      years_until_retirement + scenario.years_in_retirement + 1):
        # Grow at start of year
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

        # Determine age in this retirement year
        owner_age = scenario.age + year

        # Calculate RMD (mandatory minimum withdrawal from traditional)
        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0

        # Withdraw at least the RMD from traditional, or spending if larger
        distribution = max(rmd, min(spending, trad_balance))
        distribution = min(distribution, trad_balance)  # can't exceed balance
        trad_balance -= distribution

        tax_on_dist = calculate_federal_tax(distribution, filing_status)
        if ret_state:
            tax_on_dist += calculate_state_tax(distribution, ret_state, filing_status, scenario.custom_state_rate)
        after_tax_dist = distribution - tax_on_dist

        # If traditional distribution doesn't cover spending, draw from Roth (tax-free)
        shortfall = spending - distribution
        if shortfall > 0:
            roth_draw = min(shortfall, roth_balance)
            roth_balance -= roth_draw
            after_tax_dist += roth_draw

        discount_factor = (1 + d) ** (-year)
        npv += after_tax_dist * discount_factor

    # Phase 4: Terminal liquidation
    liquidation_year = years_until_retirement + scenario.years_in_retirement + 1
    discount_factor = (1 + d) ** (-liquidation_year)

    if trad_balance > 0:
        tax_on_liquidation = calculate_federal_tax(trad_balance, filing_status)
        if ret_state:
            tax_on_liquidation += calculate_state_tax(trad_balance, ret_state, filing_status, scenario.custom_state_rate)
        npv += (trad_balance - tax_on_liquidation) * discount_factor

    npv += roth_balance * discount_factor

    return npv


def _objective(x: np.ndarray, scenario: ScenarioInput) -> float:
    """Negative NPV for minimization."""
    return -calculate_npv(scenario, x.tolist())


def _run_scipy(
    scenario: ScenarioInput,
    bounds: list[tuple[float, float]],
    constraints: list[dict],
) -> list[float]:
    """Run scipy SLSQP with multiple restarts. Returns best conversion schedule.

    Uses 3 starting points (greedy, uniform, zero) with early termination
    when a successful result is found and subsequent restarts don't improve
    NPV by more than 0.1%.
    """
    n_years = len(scenario.income_timeline)
    max_balance = scenario.traditional_ira_balance

    greedy = greedy_bracket_fill(scenario)
    uniform = [max_balance / n_years] * n_years
    zero = [0.0] * n_years

    starting_points = [greedy, uniform, zero]

    # Scale iterations with problem dimensionality — high-dimensional problems
    # rarely converge within maxiter anyway, so cap the wasted effort.
    maxiter = min(200, max(50, 300 // max(1, n_years)))

    best_npv = float("-inf")
    best_conversions = greedy  # fallback
    had_success = False

    for x0 in starting_points:
        x0_arr = np.array(x0, dtype=float)
        # Clip to bounds
        for i, (lo, hi) in enumerate(bounds):
            x0_arr[i] = np.clip(x0_arr[i], lo, hi)
        # Ensure total doesn't exceed balance
        if np.sum(x0_arr) > max_balance:
            x0_arr = x0_arr * (max_balance / np.sum(x0_arr))

        try:
            result = minimize(
                _objective,
                x0_arr,
                args=(scenario,),
                method="SLSQP",
                bounds=bounds,
                constraints=constraints,
                options={"maxiter": maxiter, "ftol": 1e-8},
            )
            candidate_npv = -result.fun
            if candidate_npv > best_npv:
                # Early termination: if we already had a successful result and
                # the improvement is < 0.1%, stop trying more starting points.
                if had_success and best_npv > 0:
                    improvement = (candidate_npv - best_npv) / best_npv
                    if improvement < IMPROVEMENT_THRESHOLD:
                        break
                best_npv = candidate_npv
                best_conversions = result.x.tolist()
            if result.success:
                had_success = True
        except Exception:
            continue

    return best_conversions


def _finalize_conversions(raw: list[float], max_balance: float, growth_rate: float = 0.0) -> list[float]:
    """Round to nearest ROUNDING_RESOLUTION, enforce non-negative and within balance.

    Accounts for inter-year growth so later years can access the grown
    remainder, matching the DP forward-pass semantics.
    """
    remaining = max_balance
    final = []
    for c in raw:
        c = max(0.0, min(c, remaining))
        c = round_to_resolution(c)
        c = min(c, remaining)
        final.append(c)
        remaining = (remaining - c) * (1 + growth_rate)
    return final


def _build_constrained_params(
    scenario: ScenarioInput,
    prefs,
    unconstrained_conversions: list[float],
) -> tuple[list[tuple[float, float]], list[dict]]:
    """Build scipy bounds and constraints from user preferences."""
    n_years = len(scenario.income_timeline)
    max_balance = scenario.traditional_ira_balance

    # Start with base bounds
    upper = max_balance
    if prefs.max_conversion_per_year is not None:
        upper = min(upper, prefs.max_conversion_per_year)

    bounds = [(0.0, upper) for _ in range(n_years)]

    # Base constraint: total <= balance
    constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    # Max annual tax cost: combined federal+state tax <= cap
    if prefs.max_annual_tax_cost is not None:
        cap = prefs.max_annual_tax_cost
        for t in range(n_years):
            income_t = scenario.income_timeline[t].gross_income
            filing_status = scenario.filing_status
            yr_state = resolve_state_for_year(
                scenario.income_timeline[t].state, scenario.state
            )
            custom_rate = scenario.custom_state_rate

            def _tax_constraint(x, _t=t, _income=income_t, _fs=filing_status,
                                _cap=cap, _yr_state=yr_state, _custom_rate=custom_rate):
                cost = federal_tax_on_conversion(_income, x[_t], _fs)
                cost += state_tax_on_conversion(_income, x[_t], _yr_state, _fs, _custom_rate)
                return _cap - cost

            constraints.append({"type": "ineq", "fun": _tax_constraint})

    # Max total conversion across all years
    if prefs.max_conversion_total is not None:
        total_cap = prefs.max_conversion_total
        constraints.append(
            {"type": "ineq", "fun": lambda x, _cap=total_cap: _cap - np.sum(x)},
        )

    # Min conversion years: set floor bounds for the N lowest-income years
    if prefs.min_conversion_years is not None:
        min_years = min(prefs.min_conversion_years, n_years)
        total_unconstrained = sum(unconstrained_conversions)
        if total_unconstrained > 0:
            # Sort years by income (ascending) to pick lowest-income years
            year_indices = sorted(
                range(n_years),
                key=lambda t: scenario.income_timeline[t].gross_income,
            )
            target_years = year_indices[:min_years]
            floor = total_unconstrained / (min_years * 3)
            floor = min(floor, max_balance / min_years)
            bounds = list(bounds)
            for t in target_years:
                lo, hi = bounds[t]
                bounds[t] = (max(lo, floor), hi)

    return bounds, constraints


def _has_active_preferences(scenario: ScenarioInput) -> bool:
    """Check if any conversion preferences are set."""
    prefs = scenario.conversion_preferences
    if prefs is None:
        return False
    return (
        prefs.max_annual_tax_cost is not None
        or prefs.min_conversion_years is not None
        or prefs.max_conversion_per_year is not None
        or prefs.max_conversion_total is not None
    )


def _run_scipy_light(
    scenario: ScenarioInput,
    total_cap: float,
    cached_greedy: list[float] | None = None,
) -> list[float]:
    """Lighter optimizer for conversion curve: single restart, lower precision."""
    n_years = len(scenario.income_timeline)
    max_balance = min(scenario.traditional_ira_balance, total_cap)

    bounds = [(0, max_balance) for _ in range(n_years)]
    constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    greedy = cached_greedy if cached_greedy is not None else greedy_bracket_fill(scenario)
    # Cap greedy to total_cap
    remaining = total_cap
    capped_greedy = []
    for c in greedy:
        c = min(c, remaining)
        capped_greedy.append(c)
        remaining -= c
    greedy = capped_greedy

    maxiter = min(50, max(20, 100 // max(1, n_years)))

    x0_arr = np.array(greedy, dtype=float)
    for i, (lo, hi) in enumerate(bounds):
        x0_arr[i] = np.clip(x0_arr[i], lo, hi)
    if np.sum(x0_arr) > max_balance:
        x0_arr = x0_arr * (max_balance / np.sum(x0_arr))

    try:
        result = minimize(
            _objective,
            x0_arr,
            args=(scenario,),
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": maxiter, "ftol": 1e-4},
        )
        best_conversions = result.x.tolist()
    except Exception:
        best_conversions = greedy

    return _finalize_conversions(best_conversions, max_balance)


def _build_year_detail(
    scenario: ScenarioInput,
    conversions: list[float],
) -> tuple[list[dict], list[list[BracketFillResult]], float, list[AcaSubsidyDetail] | None]:
    """Build per-year detail and bracket fill data for a given conversion schedule.

    Returns (yearly_detail, yearly_bracket_fill, total_tax, aca_details).
    aca_details is None when healthcare inputs are not provided.
    """
    n_years = len(scenario.income_timeline)
    yearly_detail = []
    yearly_bracket_fill: list[list[BracketFillResult]] = []
    total_tax = 0.0

    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)
    aca_details: list[AcaSubsidyDetail] | None = [] if hc else None

    from app.engine.aca import federal_poverty_level

    for t in range(n_years):
        income = scenario.income_timeline[t].gross_income
        conversion = conversions[t]
        year = scenario.income_timeline[t].year
        year_state = resolve_state_for_year(
            scenario.income_timeline[t].state, scenario.state
        )

        fed_cost = federal_tax_on_conversion(income, conversion, scenario.filing_status)
        state_cost = state_tax_on_conversion(
            income, conversion, year_state, scenario.filing_status, scenario.custom_state_rate,
        )
        tax_cost = fed_cost + state_cost
        total_tax += tax_cost

        eff_rate = tax_cost / conversion if conversion > 0 else 0.0
        marginal = combined_marginal_rate(
            income, conversion, scenario.filing_status,
            state=year_state, custom_state_rate=scenario.custom_state_rate,
        )
        fed_marginal = get_marginal_rate(income + conversion, scenario.filing_status)

        detail = {
            "year": year,
            "income": income,
            "conversion": conversion,
            "tax_cost": round(tax_cost, 2),
            "federal_tax_cost": round(fed_cost, 2),
            "state_tax_cost": round(state_cost, 2),
            "effective_rate": round(eff_rate, 4),
            "marginal_bracket": f"{fed_marginal:.0%}",
            "state_marginal_rate": round(marginal - get_marginal_rate(income + conversion, scenario.filing_status), 4),
        }

        # Add ACA subsidy detail if applicable
        if hc and year in aca_years:
            subsidy_without = calculate_aca_subsidy(
                income, hc.household_size, hc.monthly_slcsp_premium,
            )
            subsidy_with = calculate_aca_subsidy(
                income + conversion, hc.household_size, hc.monthly_slcsp_premium,
            )
            subsidy_lost = max(0.0, subsidy_without - subsidy_with)
            combined_cost_val = tax_cost + subsidy_lost
            combined_rate_val = combined_cost_val / conversion if conversion > 0 else 0.0
            fpl = federal_poverty_level(hc.household_size)
            income_pct_fpl = ((income + conversion) / fpl) * 100
            hits_cliff = income_pct_fpl > 400

            detail["subsidy_lost"] = round(subsidy_lost, 2)
            detail["combined_cost"] = round(combined_cost_val, 2)
            detail["combined_rate"] = round(combined_rate_val, 4)

            aca_details.append(AcaSubsidyDetail(
                year=year,
                magi_without_conversion=income,
                magi_with_conversion=income + conversion,
                subsidy_without_conversion=round(subsidy_without, 2),
                subsidy_with_conversion=round(subsidy_with, 2),
                subsidy_lost=round(subsidy_lost, 2),
                federal_tax_cost=round(tax_cost, 2),
                combined_cost=round(combined_cost_val, 2),
                combined_marginal_rate=round(combined_rate_val, 4),
                income_pct_fpl=round(income_pct_fpl, 1),
                hits_cliff=hits_cliff,
            ))

        yearly_detail.append(detail)

        bracket_fill = analyze_bracket_fill(income, conversion, scenario.filing_status)
        yearly_bracket_fill.append(bracket_fill)

    return yearly_detail, yearly_bracket_fill, total_tax, aca_details


def compute_conversion_curve(
    scenario: ScenarioInput,
    n_points: int = 25,
) -> list[ConversionCurvePoint]:
    """Run optimizer at multiple total conversion caps to power the slider.

    For long trajectories (>10 years), reduce points to keep response time
    reasonable. The frontend now handles continuous slider interactivity
    via client-side tax calculations, so this curve is primarily used for
    NPV data at discrete points.
    """
    max_balance = scenario.traditional_ira_balance
    n_years = len(scenario.income_timeline)

    # Scale down points for long trajectories — each scipy call is O(n_years)
    if n_years > 15:
        n_points = min(n_points, 6)
    elif n_years > 10:
        n_points = min(n_points, 10)

    # Cache greedy once for all curve points
    cached_greedy = greedy_bracket_fill(scenario)

    points = []

    for cap in np.linspace(0, max_balance, n_points):
        cap = round_to_resolution(cap)

        if cap == 0:
            conversions = [0.0] * n_years
        else:
            conversions = _run_scipy_light(scenario, cap, cached_greedy=cached_greedy)

        yearly_detail, yearly_bracket_fill, total_tax, _ = _build_year_detail(
            scenario, conversions,
        )
        npv = calculate_npv(scenario, conversions)

        points.append(ConversionCurvePoint(
            total_cap=cap,
            yearly_conversions=conversions,
            yearly_bracket_fill=yearly_bracket_fill,
            yearly_detail=yearly_detail,
            total_tax=round(total_tax, 2),
            npv=round(npv, 2),
        ))

    return points


def _build_rmd_projection(
    scenario: ScenarioInput,
    conversions: list[float],
) -> RmdProjection | None:
    """Project RMD amounts and taxes across the retirement phase.

    Simulates the same balance trajectory as calculate_npv but captures
    per-year RMD detail for display and AI explanation.
    """
    n_years = len(scenario.income_timeline)
    g = scenario.annual_growth_rate
    filing_status = scenario.filing_status

    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance

    # Phase 1: Apply conversions and grow
    for t in range(n_years):
        conversion = min(max(0, conversions[t]), trad_balance)
        trad_balance -= conversion
        roth_balance += conversion
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

    # Phase 2: Post-trajectory growth until retirement
    years_until_retirement = scenario.retirement_age - scenario.age
    remaining_growth_years = years_until_retirement - n_years
    if remaining_growth_years > 0:
        growth_factor = (1 + g) ** remaining_growth_years
        trad_balance *= growth_factor
        roth_balance *= growth_factor

    # Spending assumption
    spending = scenario.annual_retirement_spending
    if spending is None:
        spending = (trad_balance + roth_balance) * RETIREMENT_SPENDING_RATE

    ret_state = scenario.retirement_state or scenario.state
    owner_rmd_start = rmd_start_age(scenario.age)

    # Determine if RMDs will occur during the modeled retirement period
    first_year = scenario.income_timeline[0].year
    retirement_start_year = first_year + years_until_retirement

    yearly_detail: list[RmdYearDetail] = []
    total_rmd_taxes = 0.0

    for year_offset in range(1, scenario.years_in_retirement + 1):
        year_index = years_until_retirement + year_offset
        owner_age = scenario.age + year_index
        calendar_year = first_year + year_index

        # Grow at start of year
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0

        if rmd <= 0:
            # Withdraw normally (no RMD yet)
            distribution = min(spending, trad_balance)
        else:
            distribution = max(rmd, min(spending, trad_balance))
            distribution = min(distribution, trad_balance)

        trad_balance -= distribution

        tax = calculate_federal_tax(distribution, filing_status)
        if ret_state:
            tax += calculate_state_tax(distribution, ret_state, filing_status, scenario.custom_state_rate)

        eff_rate = tax / distribution if distribution > 0 else 0.0

        # Only include years where RMDs are active
        if rmd > 0:
            yearly_detail.append(RmdYearDetail(
                year=calendar_year,
                age=owner_age,
                trad_balance_start=round(trad_balance + distribution, 2),  # pre-withdrawal
                rmd_amount=round(rmd, 2),
                actual_distribution=round(distribution, 2),
                tax_on_distribution=round(tax, 2),
                effective_rate=round(eff_rate, 4),
            ))
            total_rmd_taxes += tax

        # Draw shortfall from Roth
        shortfall = spending - distribution
        if shortfall > 0:
            roth_draw = min(shortfall, roth_balance)
            roth_balance -= roth_draw

    if not yearly_detail:
        return None

    peak_detail = max(yearly_detail, key=lambda d: d.rmd_amount)

    return RmdProjection(
        rmd_start_age=owner_rmd_start,
        rmd_start_year=yearly_detail[0].year,
        yearly_detail=yearly_detail,
        total_rmd_taxes=round(total_rmd_taxes, 2),
        peak_rmd_amount=peak_detail.rmd_amount,
        peak_rmd_year=peak_detail.year,
    )


def _build_rmd_summary(
    with_conversion: RmdProjection | None,
    without_conversion: RmdProjection | None,
) -> dict | None:
    """Build a human-readable summary of RMD impact for the AI explanation layer."""
    if with_conversion is None and without_conversion is None:
        return None

    summary: dict = {}

    if without_conversion:
        summary["rmd_start_age"] = without_conversion.rmd_start_age
        summary["total_rmd_taxes_no_conversion"] = without_conversion.total_rmd_taxes
        summary["peak_rmd_no_conversion"] = without_conversion.peak_rmd_amount
        summary["peak_rmd_year_no_conversion"] = without_conversion.peak_rmd_year

    if with_conversion:
        summary["total_rmd_taxes_with_conversion"] = with_conversion.total_rmd_taxes
        summary["peak_rmd_with_conversion"] = with_conversion.peak_rmd_amount

    if with_conversion and without_conversion:
        tax_savings = without_conversion.total_rmd_taxes - with_conversion.total_rmd_taxes
        peak_reduction = without_conversion.peak_rmd_amount - with_conversion.peak_rmd_amount
        summary["rmd_tax_savings"] = round(tax_savings, 2)
        summary["peak_rmd_reduction"] = round(peak_reduction, 2)

        if tax_savings > 0:
            summary["explanation"] = (
                f"Converting now reduces your future Required Minimum Distributions. "
                f"Without conversion, RMDs starting at age {without_conversion.rmd_start_age} "
                f"would peak at ${without_conversion.peak_rmd_amount:,.0f}/year. "
                f"With the recommended conversions, peak RMDs drop to "
                f"${with_conversion.peak_rmd_amount:,.0f}/year, saving an estimated "
                f"${tax_savings:,.0f} in total RMD taxes over retirement."
            )
        else:
            summary["explanation"] = (
                f"RMDs will begin at age {without_conversion.rmd_start_age}. "
                f"The recommended conversion schedule already accounts for future "
                f"RMD obligations in the tax optimization."
            )
    elif without_conversion:
        summary["explanation"] = (
            f"Without any Roth conversions, Required Minimum Distributions starting "
            f"at age {without_conversion.rmd_start_age} will force taxable withdrawals "
            f"peaking at ${without_conversion.peak_rmd_amount:,.0f}/year."
        )

    return summary


def _build_scenarios(
    scenario: ScenarioInput,
    final_conversions: list[float],
    total_tax: float,
    npv_at_optimal: float,
    npv_at_zero: float,
) -> list[ScenarioComparison]:
    """Build scenario comparisons (no conversion, optimal, full conversion)."""
    n_years = len(scenario.income_timeline)
    max_balance = scenario.traditional_ira_balance
    total_conversion = sum(final_conversions)
    timeline_years = [yi.year for yi in scenario.income_timeline]

    # Full conversion in year 1
    full_conversions = [max_balance] + [0.0] * (n_years - 1)
    npv_at_full = calculate_npv(scenario, full_conversions)

    yr0_income = scenario.income_timeline[0].gross_income
    yr0_state = resolve_state_for_year(
        scenario.income_timeline[0].state, scenario.state
    )
    tax_full = federal_tax_on_conversion(yr0_income, max_balance, scenario.filing_status)
    tax_full += state_tax_on_conversion(
        yr0_income, max_balance, yr0_state, scenario.filing_status, scenario.custom_state_rate,
    )

    return [
        ScenarioComparison(
            label="No conversion",
            conversion_amount=0,
            npv=npv_at_zero,
            tax_on_conversion=0,
            difference_from_optimal=npv_at_zero - npv_at_optimal,
            estimated_savings=0.0,
            yearly_conversions=[0.0] * n_years,
            years=timeline_years,
        ),
        ScenarioComparison(
            label="Highest estimated savings",
            conversion_amount=total_conversion,
            npv=npv_at_optimal,
            tax_on_conversion=total_tax,
            difference_from_optimal=0,
            estimated_savings=npv_at_optimal - npv_at_zero,
            yearly_conversions=list(final_conversions),
            years=timeline_years,
        ),
        ScenarioComparison(
            label="Full conversion (year 1)",
            conversion_amount=max_balance,
            npv=npv_at_full,
            tax_on_conversion=tax_full,
            difference_from_optimal=npv_at_full - npv_at_optimal,
            estimated_savings=npv_at_full - npv_at_zero,
            yearly_conversions=[max_balance] + [0.0] * (n_years - 1),
            years=timeline_years,
        ),
    ]


def optimize(scenario: ScenarioInput) -> OptimizationResult:
    """Find the optimal multi-year conversion schedule.

    Uses dynamic programming for globally optimal unconstrained results.
    Falls back to scipy SLSQP for constrained optimization when user
    preferences (max tax cost, etc.) are active.
    """
    from app.engine.dp import dp_optimize
    from app.engine.curve_strategy import generate_conversion_curve

    n_years = len(scenario.income_timeline)
    max_balance = scenario.traditional_ira_balance

    # --- Unconstrained: DP (globally optimal) ---
    dp_result = dp_optimize(scenario)
    unconstrained_conversions = dp_result.yearly_conversions
    unconstrained_npv = dp_result.npv

    # --- Constrained: scipy (if preferences active) ---
    if _has_active_preferences(scenario):
        prefs = scenario.conversion_preferences
        constrained_bounds, constrained_constraints = _build_constrained_params(
            scenario, prefs, unconstrained_conversions,
        )
        raw_constrained = _run_scipy(scenario, constrained_bounds, constrained_constraints)
        final_conversions = _finalize_conversions(raw_constrained, max_balance, scenario.annual_growth_rate)
    else:
        final_conversions = unconstrained_conversions

    total_conversion = sum(final_conversions)

    # Conversion curve for the interactive slider.  The active strategy is
    # controlled by curve_strategy.DEFAULT_CURVE_STRATEGY (one-line swap).
    conversion_curve = generate_conversion_curve(scenario, curve_max=total_conversion)

    # Recalculate NPV with final conversions
    npv_at_optimal = calculate_npv(scenario, final_conversions)
    npv_at_zero = calculate_npv(scenario, [0.0] * n_years)

    # Per-year detail and bracket fill
    yearly_detail, yearly_bracket_fill, total_tax, aca_details = _build_year_detail(
        scenario, final_conversions,
    )

    timeline_chart = []
    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance
    g = scenario.annual_growth_rate

    for t in range(n_years):
        income = scenario.income_timeline[t].gross_income
        c_t = final_conversions[t]

        bracket_fill = yearly_bracket_fill[t]
        timeline_chart.append({
            "year": scenario.income_timeline[t].year,
            "income": income,
            "conversion": c_t,
            "bracket_boundaries": [b.bracket_max for b in bracket_fill],
        })

        trad_balance -= c_t
        roth_balance += c_t
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

    # Project to retirement
    years_until_retirement = max(0, scenario.retirement_age - scenario.age)
    remaining_growth = years_until_retirement - n_years
    if remaining_growth > 0:
        factor = (1 + g) ** remaining_growth
        trad_balance *= factor
        roth_balance *= factor

    overall_eff_rate = total_tax / total_conversion if total_conversion > 0 else 0.0

    # Scenarios
    scenarios = _build_scenarios(
        scenario, final_conversions, total_tax, npv_at_optimal, npv_at_zero,
    )

    # NPV curve (sample points for the first year, holding others at 0)
    npv_curve: list[NPVCurvePoint] = []
    for frac in np.linspace(0, 1, 20):
        amt = frac * max_balance
        test_conversions = [amt] + [0.0] * (n_years - 1)
        npv_val = calculate_npv(scenario, test_conversions)
        npv_curve.append(NPVCurvePoint(conversion_amount=amt, npv=npv_val))

    # Generate reasoning trace
    from app.engine.trace import generate_reasoning_trace
    reasoning = generate_reasoning_trace(
        scenario, final_conversions, yearly_bracket_fill, npv_curve,
        aca_details=aca_details,
    )

    # Unconstrained comparison (only when preferences are active and changed the result)
    result_unconstrained_npv = None
    result_unconstrained_conversions = None
    if _has_active_preferences(scenario) and unconstrained_conversions != final_conversions:
        result_unconstrained_npv = round(unconstrained_npv, 2)
        result_unconstrained_conversions = unconstrained_conversions

    # ACA comparison: if healthcare inputs are active, also compute tax-only NPV
    # so the user can see the impact of including subsidy awareness
    npv_without_aca = None
    total_subsidy_lost = None
    cliff_income = None
    if scenario.healthcare and aca_details:
        # Run NPV without ACA by temporarily removing healthcare inputs
        scenario_no_aca = scenario.model_copy(update={"healthcare": None})
        npv_without_aca = round(calculate_npv(scenario_no_aca, final_conversions), 2)
        total_subsidy_lost = round(sum(d.subsidy_lost for d in aca_details), 2)
        cliff_income = round(find_subsidy_cliff_income(scenario.healthcare.household_size), 2)

    # RMD projection: with optimal conversions and with no conversions
    rmd_projection = _build_rmd_projection(scenario, final_conversions)
    rmd_projection_no_conv = _build_rmd_projection(scenario, [0.0] * n_years)

    # Pass RMD projections to reasoning trace
    reasoning.rmd_summary = _build_rmd_summary(rmd_projection, rmd_projection_no_conv)

    return OptimizationResult(
        yearly_conversions=final_conversions,
        total_conversion=total_conversion,
        total_tax_on_conversions=round(total_tax, 2),
        overall_effective_rate=round(overall_eff_rate, 4),
        estimated_lifetime_tax_savings=round(npv_at_optimal - npv_at_zero, 2),
        npv_at_optimal=round(npv_at_optimal, 2),
        npv_at_zero=round(npv_at_zero, 2),
        yearly_detail=yearly_detail,
        yearly_bracket_fill=yearly_bracket_fill,
        scenarios=scenarios,
        reasoning_trace=reasoning,
        traditional_at_retirement=round(trad_balance, 2),
        roth_at_retirement=round(roth_balance, 2),
        timeline_chart=timeline_chart,
        conversion_curve=conversion_curve,
        unconstrained_npv=result_unconstrained_npv,
        unconstrained_conversions=result_unconstrained_conversions,
        aca_subsidy_impact=aca_details,
        total_subsidy_lost=total_subsidy_lost,
        subsidy_cliff_income=cliff_income,
        npv_without_aca=npv_without_aca,
        rmd_projection=rmd_projection,
        rmd_projection_no_conversion=rmd_projection_no_conv,
        input=scenario,
    )
