import numpy as np
from scipy.optimize import minimize

from app.engine.types import (
    ScenarioInput, OptimizationResult, ScenarioComparison,
    NPVCurvePoint, BracketFillResult, ConversionCurvePoint,
    ConversionPreferences,
)
from app.engine.tax import calculate_federal_tax, get_marginal_rate, analyze_bracket_fill
from app.engine.heuristic import greedy_bracket_fill


def calculate_npv(scenario: ScenarioInput, yearly_conversions: list[float]) -> float:
    """Calculate NPV for a given multi-year conversion schedule.

    Model phases:
    1. Conversion years: pay tax on conversions, shift balances, grow
    2. Post-trajectory growth: grow both accounts until retirement
    3. Retirement: withdraw from traditional (taxed), Roth grows tax-free
    4. Terminal liquidation: remaining balances distributed
    """
    n_years = len(scenario.income_trajectory)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    filing_status = scenario.filing_status

    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance
    npv = 0.0

    # Phase 1: Conversion years
    for t in range(n_years):
        income = scenario.income_trajectory[t].gross_income
        c_t = min(max(0, yearly_conversions[t]), trad_balance)

        tax_with = calculate_federal_tax(income + c_t, filing_status)
        tax_without = calculate_federal_tax(income, filing_status)
        conversion_tax = tax_with - tax_without

        # Conversion tax is paid now (discounted to year t)
        discount_factor = (1 + d) ** (-t)
        npv -= conversion_tax * discount_factor

        # Shift balances
        trad_balance -= c_t
        roth_balance += c_t

        # Grow both accounts
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

    # Phase 2: Post-trajectory growth until retirement
    years_until_retirement = scenario.retirement_age - scenario.age
    remaining_growth_years = years_until_retirement - n_years
    if remaining_growth_years > 0:
        growth_factor = (1 + g) ** remaining_growth_years
        trad_balance *= growth_factor
        roth_balance *= growth_factor

    # Phase 3: Retirement distributions
    spending = scenario.annual_retirement_spending
    if spending is None:
        total_balance = trad_balance + roth_balance
        spending = total_balance * 0.04

    for year in range(years_until_retirement + 1,
                      years_until_retirement + scenario.years_in_retirement + 1):
        # Grow at start of year
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

        # Withdraw from traditional first
        distribution = min(spending, trad_balance)
        trad_balance -= distribution

        tax_on_dist = calculate_federal_tax(distribution, filing_status)
        after_tax_dist = distribution - tax_on_dist

        # If traditional doesn't cover spending, draw from Roth (tax-free)
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
    """Run scipy SLSQP with multiple restarts. Returns best conversion schedule."""
    n_years = len(scenario.income_trajectory)
    max_balance = scenario.traditional_ira_balance

    greedy = greedy_bracket_fill(scenario)
    uniform = [max_balance / n_years] * n_years
    front_loaded = [max_balance * 0.6 / max(1, n_years - 1)] * n_years
    if n_years > 1:
        front_loaded[0] = max_balance * 0.4
    back_loaded = list(reversed(front_loaded))
    zero = [0.0] * n_years

    starting_points = [greedy, uniform, front_loaded, back_loaded, zero]

    best_npv = float("-inf")
    best_conversions = greedy  # fallback

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
                options={"maxiter": 200, "ftol": 1e-8},
            )
            if result.success or result.fun < -best_npv:
                candidate_npv = -result.fun
                if candidate_npv > best_npv:
                    best_npv = candidate_npv
                    best_conversions = result.x.tolist()
        except Exception:
            continue

    return best_conversions


def _finalize_conversions(raw: list[float], max_balance: float) -> list[float]:
    """Round to nearest $100, enforce non-negative and within balance."""
    remaining = max_balance
    final = []
    for c in raw:
        c = max(0.0, min(c, remaining))
        c = round(c / 100) * 100
        c = min(c, remaining)
        final.append(c)
        remaining -= c
    return final


def _build_constrained_params(
    scenario: ScenarioInput,
    prefs,
    unconstrained_conversions: list[float],
) -> tuple[list[tuple[float, float]], list[dict]]:
    """Build scipy bounds and constraints from user preferences."""
    n_years = len(scenario.income_trajectory)
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

    # Max annual tax cost: tax(income_t + c_t) - tax(income_t) <= cap
    if prefs.max_annual_tax_cost is not None:
        cap = prefs.max_annual_tax_cost
        for t in range(n_years):
            income_t = scenario.income_trajectory[t].gross_income
            fs = scenario.filing_status

            def _tax_constraint(x, _t=t, _income=income_t, _fs=fs, _cap=cap):
                tax_with = calculate_federal_tax(_income + x[_t], _fs)
                tax_without = calculate_federal_tax(_income, _fs)
                return _cap - (tax_with - tax_without)

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
                key=lambda t: scenario.income_trajectory[t].gross_income,
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
) -> list[float]:
    """Lighter optimizer for conversion curve: fewer restarts, lower precision."""
    n_years = len(scenario.income_trajectory)
    max_balance = min(scenario.traditional_ira_balance, total_cap)

    bounds = [(0, max_balance) for _ in range(n_years)]
    constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    greedy = greedy_bracket_fill(scenario)
    # Cap greedy to total_cap
    remaining = total_cap
    capped_greedy = []
    for c in greedy:
        c = min(c, remaining)
        capped_greedy.append(c)
        remaining -= c
    greedy = capped_greedy

    zero = [0.0] * n_years
    starting_points = [greedy, zero]

    best_npv = float("-inf")
    best_conversions = greedy

    for x0 in starting_points:
        x0_arr = np.array(x0, dtype=float)
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
                options={"maxiter": 50, "ftol": 1e-4},
            )
            if result.success or result.fun < -best_npv:
                candidate_npv = -result.fun
                if candidate_npv > best_npv:
                    best_npv = candidate_npv
                    best_conversions = result.x.tolist()
        except Exception:
            continue

    return _finalize_conversions(best_conversions, max_balance)


def _build_year_detail(
    scenario: ScenarioInput,
    conversions: list[float],
) -> tuple[list[dict], list[list[BracketFillResult]], float]:
    """Build per-year detail and bracket fill data for a given conversion schedule."""
    n_years = len(scenario.income_trajectory)
    yearly_detail = []
    yearly_bracket_fill: list[list[BracketFillResult]] = []
    total_tax = 0.0

    for t in range(n_years):
        income = scenario.income_trajectory[t].gross_income
        c_t = conversions[t]

        tax_with = calculate_federal_tax(income + c_t, scenario.filing_status)
        tax_without = calculate_federal_tax(income, scenario.filing_status)
        tax_cost = tax_with - tax_without
        total_tax += tax_cost

        eff_rate = tax_cost / c_t if c_t > 0 else 0.0
        marginal = get_marginal_rate(income + c_t, scenario.filing_status)

        yearly_detail.append({
            "year": scenario.income_trajectory[t].year,
            "income": income,
            "conversion": c_t,
            "tax_cost": round(tax_cost, 2),
            "effective_rate": round(eff_rate, 4),
            "marginal_bracket": f"{marginal:.0%}",
        })

        bracket_fill = analyze_bracket_fill(income, c_t, scenario.filing_status)
        yearly_bracket_fill.append(bracket_fill)

    return yearly_detail, yearly_bracket_fill, total_tax


def compute_conversion_curve(
    scenario: ScenarioInput,
    n_points: int = 25,
) -> list[ConversionCurvePoint]:
    """Run optimizer at multiple total conversion caps to power the slider."""
    max_balance = scenario.traditional_ira_balance
    n_years = len(scenario.income_trajectory)
    points = []

    for cap in np.linspace(0, max_balance, n_points):
        cap = round(cap / 100) * 100  # Round to nearest $100

        if cap == 0:
            conversions = [0.0] * n_years
        else:
            conversions = _run_scipy_light(scenario, cap)

        yearly_detail, yearly_bracket_fill, total_tax = _build_year_detail(
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


def optimize(scenario: ScenarioInput) -> OptimizationResult:
    """Find the optimal multi-year conversion schedule using scipy SLSQP.

    Two-pass approach when conversion preferences are active:
    1. Unconstrained pass — pure NPV maximization
    2. Constrained pass — apply user preferences as scipy constraints/bounds
    """
    n_years = len(scenario.income_trajectory)
    max_balance = scenario.traditional_ira_balance

    # --- Pass 1: Unconstrained optimization ---
    unconstrained_bounds = [(0, max_balance) for _ in range(n_years)]
    unconstrained_constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    raw_unconstrained = _run_scipy(scenario, unconstrained_bounds, unconstrained_constraints)
    unconstrained_conversions = _finalize_conversions(raw_unconstrained, max_balance)
    unconstrained_npv = calculate_npv(scenario, unconstrained_conversions)

    # --- Pass 2: Constrained optimization (if preferences active) ---
    if _has_active_preferences(scenario):
        prefs = scenario.conversion_preferences
        constrained_bounds, constrained_constraints = _build_constrained_params(
            scenario, prefs, unconstrained_conversions,
        )
        raw_constrained = _run_scipy(scenario, constrained_bounds, constrained_constraints)
        final_conversions = _finalize_conversions(raw_constrained, max_balance)
    else:
        final_conversions = unconstrained_conversions

    # Recalculate NPV with final conversions
    npv_at_optimal = calculate_npv(scenario, final_conversions)
    npv_at_zero = calculate_npv(scenario, [0.0] * n_years)

    # Per-year detail and bracket fill
    yearly_detail, yearly_bracket_fill, total_tax = _build_year_detail(
        scenario, final_conversions,
    )

    trajectory_chart = []
    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance
    g = scenario.annual_growth_rate

    for t in range(n_years):
        income = scenario.income_trajectory[t].gross_income
        c_t = final_conversions[t]

        bracket_fill = yearly_bracket_fill[t]
        trajectory_chart.append({
            "year": scenario.income_trajectory[t].year,
            "income": income,
            "conversion": c_t,
            "bracket_boundaries": [b.bracket_max for b in bracket_fill],
        })

        trad_balance -= c_t
        roth_balance += c_t
        trad_balance *= (1 + g)
        roth_balance *= (1 + g)

    # Project to retirement
    years_until_retirement = scenario.retirement_age - scenario.age
    remaining_growth = years_until_retirement - n_years
    if remaining_growth > 0:
        factor = (1 + g) ** remaining_growth
        trad_balance *= factor
        roth_balance *= factor

    total_conversion = sum(final_conversions)
    overall_eff_rate = total_tax / total_conversion if total_conversion > 0 else 0.0

    # Scenarios
    full_conversions = [max_balance] + [0.0] * (n_years - 1)
    npv_at_full = calculate_npv(scenario, full_conversions)
    tax_full = (
        calculate_federal_tax(
            scenario.income_trajectory[0].gross_income + max_balance,
            scenario.filing_status
        )
        - calculate_federal_tax(
            scenario.income_trajectory[0].gross_income,
            scenario.filing_status
        )
    )

    scenarios = [
        ScenarioComparison(
            label="No conversion",
            conversion_amount=0,
            npv=npv_at_zero,
            tax_on_conversion=0,
            difference_from_optimal=npv_at_zero - npv_at_optimal,
        ),
        ScenarioComparison(
            label="Optimal conversion",
            conversion_amount=total_conversion,
            npv=npv_at_optimal,
            tax_on_conversion=total_tax,
            difference_from_optimal=0,
        ),
        ScenarioComparison(
            label="Full conversion (year 1)",
            conversion_amount=max_balance,
            npv=npv_at_full,
            tax_on_conversion=tax_full,
            difference_from_optimal=npv_at_full - npv_at_optimal,
        ),
    ]

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
        scenario, final_conversions, yearly_bracket_fill, npv_curve
    )

    # Unconstrained comparison (only when preferences are active and changed the result)
    result_unconstrained_npv = None
    result_unconstrained_conversions = None
    if _has_active_preferences(scenario) and unconstrained_conversions != final_conversions:
        result_unconstrained_npv = round(unconstrained_npv, 2)
        result_unconstrained_conversions = unconstrained_conversions

    # Pre-compute conversion curve for interactive slider
    conversion_curve = compute_conversion_curve(scenario)

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
        trajectory_chart=trajectory_chart,
        conversion_curve=conversion_curve,
        unconstrained_npv=result_unconstrained_npv,
        unconstrained_conversions=result_unconstrained_conversions,
        input=scenario,
    )
