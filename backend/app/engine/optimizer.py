import numpy as np
from scipy.optimize import minimize

from app.engine.types import (
    ScenarioInput, OptimizationResult, ScenarioComparison,
    NPVCurvePoint, BracketFillResult, ConversionCurvePoint,
    ConversionPreferences, AcaSubsidyDetail,
)
from app.engine.tax import calculate_federal_tax, get_marginal_rate, analyze_bracket_fill
from app.engine.heuristic import greedy_bracket_fill
from app.engine.aca import calculate_subsidy_loss, calculate_aca_subsidy, find_subsidy_cliff_income


def _aca_coverage_years(scenario: ScenarioInput) -> set[int]:
    """Determine which calendar years the user needs ACA marketplace coverage.

    If healthcare inputs specify explicit years, use those. If
    has_employer_coverage_after is set, only model ACA for years before it.
    Otherwise, defaults to all trajectory years (conservative — optimizer
    will find the right balance).
    """
    hc = scenario.healthcare
    if hc is None:
        return set()

    trajectory_years = {y.year for y in scenario.income_trajectory}

    if hc.aca_coverage_years is not None:
        return set(hc.aca_coverage_years) & trajectory_years

    if hc.has_employer_coverage_after is not None:
        return {y for y in trajectory_years if y < hc.has_employer_coverage_after}

    return trajectory_years


def calculate_npv(scenario: ScenarioInput, yearly_conversions: list[float]) -> float:
    """Calculate NPV for a given multi-year conversion schedule.

    Model phases:
    1. Conversion years: pay tax on conversions, shift balances, grow
    2. Post-trajectory growth: grow both accounts until retirement
    3. Retirement: withdraw from traditional (taxed), Roth grows tax-free
    4. Terminal liquidation: remaining balances distributed

    When healthcare inputs are provided, subsidy loss from conversions
    is included as an additional cost in Phase 1.
    """
    n_years = len(scenario.income_trajectory)
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
        income = scenario.income_trajectory[t].gross_income
        c_t = min(max(0, yearly_conversions[t]), trad_balance)

        tax_with = calculate_federal_tax(income + c_t, filing_status)
        tax_without = calculate_federal_tax(income, filing_status)
        conversion_tax = tax_with - tax_without

        # ACA subsidy loss (if healthcare inputs provided and this is a coverage year)
        subsidy_loss = 0.0
        if hc and scenario.income_trajectory[t].year in aca_years:
            subsidy_loss = calculate_subsidy_loss(
                income, c_t, hc.household_size, hc.monthly_slcsp_premium,
            )

        # Total conversion cost = federal tax + subsidy loss
        total_cost = conversion_tax + subsidy_loss

        # Conversion cost is paid now (discounted to year t)
        discount_factor = (1 + d) ** (-t)
        npv -= total_cost * discount_factor

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
    """Run scipy SLSQP with multiple restarts. Returns best conversion schedule.

    Uses 3 starting points (greedy, uniform, zero) with early termination
    when a successful result is found and subsequent restarts don't improve
    NPV by more than 0.1%.
    """
    n_years = len(scenario.income_trajectory)
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
                    if improvement < 0.001:
                        break
                best_npv = candidate_npv
                best_conversions = result.x.tolist()
            if result.success:
                had_success = True
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
    cached_greedy: list[float] | None = None,
) -> list[float]:
    """Lighter optimizer for conversion curve: single restart, lower precision."""
    n_years = len(scenario.income_trajectory)
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
    n_years = len(scenario.income_trajectory)
    yearly_detail = []
    yearly_bracket_fill: list[list[BracketFillResult]] = []
    total_tax = 0.0

    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)
    aca_details: list[AcaSubsidyDetail] | None = [] if hc else None

    from app.engine.aca import federal_poverty_level

    for t in range(n_years):
        income = scenario.income_trajectory[t].gross_income
        c_t = conversions[t]
        year = scenario.income_trajectory[t].year

        tax_with = calculate_federal_tax(income + c_t, scenario.filing_status)
        tax_without = calculate_federal_tax(income, scenario.filing_status)
        tax_cost = tax_with - tax_without
        total_tax += tax_cost

        eff_rate = tax_cost / c_t if c_t > 0 else 0.0
        marginal = get_marginal_rate(income + c_t, scenario.filing_status)

        detail = {
            "year": year,
            "income": income,
            "conversion": c_t,
            "tax_cost": round(tax_cost, 2),
            "effective_rate": round(eff_rate, 4),
            "marginal_bracket": f"{marginal:.0%}",
        }

        # Add ACA subsidy detail if applicable
        if hc and year in aca_years:
            subsidy_without = calculate_aca_subsidy(
                income, hc.household_size, hc.monthly_slcsp_premium,
            )
            subsidy_with = calculate_aca_subsidy(
                income + c_t, hc.household_size, hc.monthly_slcsp_premium,
            )
            subsidy_lost = max(0.0, subsidy_without - subsidy_with)
            combined_cost = tax_cost + subsidy_lost
            combined_rate = combined_cost / c_t if c_t > 0 else 0.0
            fpl = federal_poverty_level(hc.household_size)
            income_pct_fpl = ((income + c_t) / fpl) * 100
            hits_cliff = income_pct_fpl > 400

            detail["subsidy_lost"] = round(subsidy_lost, 2)
            detail["combined_cost"] = round(combined_cost, 2)
            detail["combined_rate"] = round(combined_rate, 4)

            aca_details.append(AcaSubsidyDetail(
                year=year,
                magi_without_conversion=income,
                magi_with_conversion=income + c_t,
                subsidy_without_conversion=round(subsidy_without, 2),
                subsidy_with_conversion=round(subsidy_with, 2),
                subsidy_lost=round(subsidy_lost, 2),
                federal_tax_cost=round(tax_cost, 2),
                combined_cost=round(combined_cost, 2),
                combined_marginal_rate=round(combined_rate, 4),
                income_pct_fpl=round(income_pct_fpl, 1),
                hits_cliff=hits_cliff,
            ))

        yearly_detail.append(detail)

        bracket_fill = analyze_bracket_fill(income, c_t, scenario.filing_status)
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
    n_years = len(scenario.income_trajectory)

    # Scale down points for long trajectories — each scipy call is O(n_years)
    if n_years > 15:
        n_points = min(n_points, 6)
    elif n_years > 10:
        n_points = min(n_points, 10)

    # Cache greedy once for all curve points
    cached_greedy = greedy_bracket_fill(scenario)

    points = []

    for cap in np.linspace(0, max_balance, n_points):
        cap = round(cap / 100) * 100  # Round to nearest $100

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


def optimize(scenario: ScenarioInput) -> OptimizationResult:
    """Find the optimal multi-year conversion schedule.

    Uses dynamic programming for globally optimal unconstrained results.
    Falls back to scipy SLSQP for constrained optimization when user
    preferences (max tax cost, etc.) are active.
    """
    from app.engine.dp import dp_optimize, extract_conversion_curve_3d

    n_years = len(scenario.income_trajectory)
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
        final_conversions = _finalize_conversions(raw_constrained, max_balance)
    else:
        final_conversions = unconstrained_conversions

    # Conversion curve: 3D DP with budget constraint for accurate per-cap schedules
    conversion_curve = extract_conversion_curve_3d(scenario)

    # Recalculate NPV with final conversions
    npv_at_optimal = calculate_npv(scenario, final_conversions)
    npv_at_zero = calculate_npv(scenario, [0.0] * n_years)

    # Per-year detail and bracket fill
    yearly_detail, yearly_bracket_fill, total_tax, aca_details = _build_year_detail(
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

    trajectory_years = [yi.year for yi in scenario.income_trajectory]
    scenarios = [
        ScenarioComparison(
            label="No conversion",
            conversion_amount=0,
            npv=npv_at_zero,
            tax_on_conversion=0,
            difference_from_optimal=npv_at_zero - npv_at_optimal,
            estimated_savings=0.0,
            yearly_conversions=[0.0] * n_years,
            years=trajectory_years,
        ),
        ScenarioComparison(
            label="Highest estimated savings",
            conversion_amount=total_conversion,
            npv=npv_at_optimal,
            tax_on_conversion=total_tax,
            difference_from_optimal=0,
            estimated_savings=npv_at_optimal - npv_at_zero,
            yearly_conversions=list(final_conversions),
            years=trajectory_years,
        ),
        ScenarioComparison(
            label="Full conversion (year 1)",
            conversion_amount=max_balance,
            npv=npv_at_full,
            tax_on_conversion=tax_full,
            difference_from_optimal=npv_at_full - npv_at_optimal,
            estimated_savings=npv_at_full - npv_at_zero,
            yearly_conversions=[max_balance] + [0.0] * (n_years - 1),
            years=trajectory_years,
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
        aca_subsidy_impact=aca_details,
        total_subsidy_lost=total_subsidy_lost,
        subsidy_cliff_income=cliff_income,
        npv_without_aca=npv_without_aca,
        input=scenario,
    )
