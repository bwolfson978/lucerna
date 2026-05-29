import numpy as np
from scipy.optimize import minimize

from app.engine.aca import calculate_aca_subsidy, find_subsidy_cliff_income
from app.engine.constants import (
    IMPROVEMENT_THRESHOLD,
    RETIREMENT_SPENDING_RATE,
    round_to_resolution,
)
from app.engine.heuristic import greedy_bracket_fill
from app.engine.irmaa import (
    IRMAA_LOOKBACK_YEARS,
    MEDICARE_START_AGE,
    calculate_irmaa,
    irmaa_surcharge_loss,
    irmaa_tier_index,
)
from app.engine.rmd import calculate_rmd, rmd_start_age
from app.engine.state_tax import calculate_state_tax, resolve_state_for_year
from app.engine.tax import analyze_bracket_fill, calculate_federal_tax, get_marginal_rate
from app.engine.tax_cost import (
    combined_marginal_rate,
    federal_tax_on_conversion,
    state_tax_on_conversion,
    total_conversion_cost,
)
from app.engine.types import (
    AcaSubsidyDetail,
    BracketFillResult,
    ConversionCurvePoint,
    IrmaaProjection,
    IrmaaYearDetail,
    NPVCurvePoint,
    OptimizationResult,
    RmdProjection,
    RmdYearDetail,
    ScenarioComparison,
    ScenarioInput,
)


def _aca_coverage_years(scenario: ScenarioInput) -> set[int]:
    """Determine which calendar years the user needs ACA marketplace coverage."""
    hc = scenario.healthcare
    if hc is None:
        return set()

    timeline_years = {y.year for y in scenario.timeline}

    if hc.aca_coverage_years is not None:
        return set(hc.aca_coverage_years) & timeline_years

    if hc.has_employer_coverage_after is not None:
        return {y for y in timeline_years if y < hc.has_employer_coverage_after}

    return timeline_years


def _irmaa_exposed_years(scenario: ScenarioInput) -> set[int]:
    """Timeline year indices (0-based) where a conversion creates IRMAA exposure.

    A conversion in timeline year t causes IRMAA in year t+2. IRMAA applies
    from Medicare start age (65). So we need: age + t + LOOKBACK >= MEDICARE_START_AGE.
    """
    threshold = MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS
    return {t for t in range(len(scenario.timeline)) if scenario.age + t >= threshold}


def calculate_npv(scenario: ScenarioInput, yearly_conversions: list[float]) -> float:
    """Calculate NPV for a given multi-year conversion schedule.

    Unified timeline loop: every year can have conversions, RMDs, and drawdowns.
    A post-timeline fallback handles years beyond the timeline until
    planning_horizon_age. Terminal liquidation at planning_horizon_age.
    """
    n_years = len(scenario.timeline)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    filing_status = scenario.filing_status

    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance
    npv = 0.0

    aca_years = _aca_coverage_years(scenario)
    irmaa_exposed = _irmaa_exposed_years(scenario)
    hc = scenario.healthcare
    ret_state = scenario.retirement_state or scenario.state
    owner_rmd_start = rmd_start_age(scenario.age)

    # ── Unified timeline loop ────────────────────────────────────────────────
    for t in range(n_years):
        entry = scenario.timeline[t]
        income = entry.gross_income
        owner_age = scenario.age + t
        year_state = resolve_state_for_year(entry.state, scenario.state)
        is_aca_year = hc is not None and entry.year in aca_years
        discount_factor = (1 + d) ** (-t)

        # RMD: computed on start-of-year balance, deducted before conversion
        rmd = (
            calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        )
        rmd = min(rmd, trad_balance)

        effective_income = income + rmd  # income base for conversion tax

        # Conversion (on balance remaining after RMD)
        available_for_conv = max(0.0, trad_balance - rmd)
        conversion = min(max(0.0, yearly_conversions[t]), available_for_conv)

        # Tax cost of RMD (marginal on top of gross_income)
        if rmd > 0:
            rmd_tax = calculate_federal_tax(
                income + rmd, filing_status
            ) - calculate_federal_tax(income, filing_status)
            if year_state:
                rmd_tax += calculate_state_tax(
                    income + rmd, year_state, filing_status, scenario.custom_state_rate
                ) - calculate_state_tax(income, year_state, filing_status, scenario.custom_state_rate)
            after_tax_rmd = rmd - rmd_tax
            npv += after_tax_rmd * discount_factor

        # Tax cost of conversion (marginal on top of effective_income)
        conv_cost = total_conversion_cost(
            effective_income,
            conversion,
            filing_status,
            state=year_state,
            custom_state_rate=scenario.custom_state_rate,
            healthcare=hc if is_aca_year else None,
            is_aca_year=is_aca_year,
        )
        npv -= conv_cost * discount_factor

        # IRMAA cost (2-year lag — discounted at the surcharge year, not conversion year)
        if t in irmaa_exposed and conversion > 0:
            irmaa_cost = irmaa_surcharge_loss(effective_income, conversion, filing_status)
            if irmaa_cost > 0:
                irmaa_discount = (1 + d) ** (-(t + IRMAA_LOOKBACK_YEARS))
                npv -= irmaa_cost * irmaa_discount

        # Update balances: RMD then conversion then growth
        trad_balance -= rmd
        trad_balance -= conversion
        roth_balance += conversion

        # Per-year drawdown (if set in this PlanYear)
        if entry.drawdown is not None and entry.drawdown > 0:
            drawdown_needed = entry.drawdown
            drawdown_base = effective_income + conversion

            trad_draw = min(drawdown_needed, trad_balance)
            if trad_draw > 0:
                trad_draw_tax = calculate_federal_tax(
                    drawdown_base + trad_draw, filing_status
                ) - calculate_federal_tax(drawdown_base, filing_status)
                if year_state:
                    trad_draw_tax += calculate_state_tax(
                        drawdown_base + trad_draw,
                        year_state,
                        filing_status,
                        scenario.custom_state_rate,
                    ) - calculate_state_tax(
                        drawdown_base, year_state, filing_status, scenario.custom_state_rate
                    )
                npv += (trad_draw - trad_draw_tax) * discount_factor
                trad_balance -= trad_draw
                drawdown_needed -= trad_draw

            roth_draw = min(drawdown_needed, roth_balance)
            if roth_draw > 0:
                npv += roth_draw * discount_factor
                roth_balance -= roth_draw

        trad_balance *= 1 + g
        roth_balance *= 1 + g

    # ── Post-timeline fallback ───────────────────────────────────────────────
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    phase3_start = max(n_years, years_until_drawdown)

    # Grow across any gap between end-of-timeline and phase3_start
    extra_growth = phase3_start - n_years
    if extra_growth > 0:
        trad_balance *= (1 + g) ** extra_growth
        roth_balance *= (1 + g) ** extra_growth

    spending = scenario.default_drawdown
    if spending is None:
        spending = (trad_balance + roth_balance) * RETIREMENT_SPENDING_RATE

    total_plan_years = scenario.planning_horizon_age - scenario.age

    for year_offset in range(1, total_plan_years - phase3_start + 1):
        year = phase3_start + year_offset
        owner_age = scenario.age + year

        pre_growth_trad = trad_balance
        trad_balance *= 1 + g
        roth_balance *= 1 + g

        rmd = (
            calculate_rmd(pre_growth_trad, owner_age) if owner_age >= owner_rmd_start else 0.0
        )
        distribution = max(rmd, min(spending, trad_balance))
        distribution = min(distribution, trad_balance)
        trad_balance -= distribution

        tax_on_dist = calculate_federal_tax(distribution, filing_status)
        if ret_state:
            tax_on_dist += calculate_state_tax(
                distribution, ret_state, filing_status, scenario.custom_state_rate
            )
        after_tax_dist = distribution - tax_on_dist

        shortfall = spending - distribution
        if shortfall > 0:
            roth_draw = min(shortfall, roth_balance)
            roth_balance -= roth_draw
            after_tax_dist += roth_draw

        discount_factor = (1 + d) ** (-year)
        npv += after_tax_dist * discount_factor

    # ── Terminal liquidation ─────────────────────────────────────────────────
    liquidation_year = total_plan_years + 1
    discount_factor = (1 + d) ** (-liquidation_year)

    if trad_balance > 0:
        tax_on_liquidation = calculate_federal_tax(trad_balance, filing_status)
        if ret_state:
            tax_on_liquidation += calculate_state_tax(
                trad_balance, ret_state, filing_status, scenario.custom_state_rate
            )
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
    n_years = len(scenario.timeline)
    max_balance = scenario.traditional_ira_balance

    greedy = greedy_bracket_fill(scenario)
    uniform = [max_balance / n_years] * n_years
    zero = [0.0] * n_years

    starting_points = [greedy, uniform, zero]
    maxiter = min(200, max(50, 300 // max(1, n_years)))

    best_npv = float("-inf")
    best_conversions = greedy
    had_success = False

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
                options={"maxiter": maxiter, "ftol": 1e-8},
            )
            candidate_npv = -result.fun
            if candidate_npv > best_npv:
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


def _finalize_conversions(
    raw: list[float], max_balance: float, growth_rate: float = 0.0
) -> list[float]:
    """Round to nearest ROUNDING_RESOLUTION, enforce non-negative and within balance."""
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
    n_years = len(scenario.timeline)
    max_balance = scenario.traditional_ira_balance

    upper = max_balance
    if prefs.max_conversion_per_year is not None:
        upper = min(upper, prefs.max_conversion_per_year)

    bounds = [(0.0, upper) for _ in range(n_years)]

    constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    if prefs.max_annual_tax_cost is not None:
        cap = prefs.max_annual_tax_cost
        for t in range(n_years):
            income_t = scenario.timeline[t].gross_income
            filing_status = scenario.filing_status
            yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
            custom_rate = scenario.custom_state_rate

            def _tax_constraint(
                x,
                _t=t,
                _income=income_t,
                _fs=filing_status,
                _cap=cap,
                _yr_state=yr_state,
                _custom_rate=custom_rate,
            ):
                cost = federal_tax_on_conversion(_income, x[_t], _fs)
                cost += state_tax_on_conversion(_income, x[_t], _yr_state, _fs, _custom_rate)
                return _cap - cost

            constraints.append({"type": "ineq", "fun": _tax_constraint})

    if prefs.max_conversion_total is not None:
        total_cap = prefs.max_conversion_total
        constraints.append(
            {"type": "ineq", "fun": lambda x, _cap=total_cap: _cap - np.sum(x)},
        )

    if prefs.min_conversion_years is not None:
        min_years = min(prefs.min_conversion_years, n_years)
        total_unconstrained = sum(unconstrained_conversions)
        if total_unconstrained > 0:
            year_indices = sorted(
                range(n_years),
                key=lambda t: scenario.timeline[t].gross_income,
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
    n_years = len(scenario.timeline)
    max_balance = min(scenario.traditional_ira_balance, total_cap)

    bounds = [(0, max_balance) for _ in range(n_years)]
    constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    greedy = cached_greedy if cached_greedy is not None else greedy_bracket_fill(scenario)
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
    """Build per-year detail and bracket fill data for a given conversion schedule."""
    n_years = len(scenario.timeline)
    yearly_detail = []
    yearly_bracket_fill: list[list[BracketFillResult]] = []
    total_tax = 0.0

    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)
    irmaa_exposed = _irmaa_exposed_years(scenario)
    aca_details: list[AcaSubsidyDetail] | None = [] if hc else None

    owner_rmd_start = rmd_start_age(scenario.age)
    trad_balance = scenario.traditional_ira_balance

    from app.engine.aca import federal_poverty_level

    for t in range(n_years):
        entry = scenario.timeline[t]
        income = entry.gross_income
        conversion = conversions[t]
        year = entry.year
        year_state = resolve_state_for_year(entry.state, scenario.state)
        owner_age = scenario.age + t

        # RMD for this year (on start-of-year balance)
        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, trad_balance)
        effective_income = income + rmd

        fed_cost = federal_tax_on_conversion(effective_income, conversion, scenario.filing_status)
        state_cost = state_tax_on_conversion(
            effective_income,
            conversion,
            year_state,
            scenario.filing_status,
            scenario.custom_state_rate,
        )
        tax_cost = fed_cost + state_cost
        total_tax += tax_cost

        eff_rate = tax_cost / conversion if conversion > 0 else 0.0
        marginal = combined_marginal_rate(
            effective_income,
            conversion,
            scenario.filing_status,
            state=year_state,
            custom_state_rate=scenario.custom_state_rate,
        )
        fed_marginal = get_marginal_rate(effective_income + conversion, scenario.filing_status)

        # IRMAA detail
        irmaa_cost = 0.0
        irmaa_tier = 0
        if t in irmaa_exposed:
            irmaa_cost = irmaa_surcharge_loss(effective_income, conversion, scenario.filing_status)
            irmaa_tier = irmaa_tier_index(
                effective_income + conversion, scenario.filing_status
            )

        detail: dict = {
            "year": year,
            "income": income,
            "rmd": round(rmd, 2),
            "conversion": conversion,
            "tax_cost": round(tax_cost, 2),
            "federal_tax_cost": round(fed_cost, 2),
            "state_tax_cost": round(state_cost, 2),
            "effective_rate": round(eff_rate, 4),
            "marginal_bracket": f"{fed_marginal:.0%}",
            "state_marginal_rate": round(
                marginal - get_marginal_rate(effective_income + conversion, scenario.filing_status),
                4,
            ),
            "irmaa_cost": round(irmaa_cost, 2),
            "irmaa_tier": irmaa_tier,
        }

        if hc and year in aca_years:
            subsidy_without = calculate_aca_subsidy(
                income,
                hc.household_size,
                hc.monthly_slcsp_premium,
            )
            subsidy_with = calculate_aca_subsidy(
                income + conversion,
                hc.household_size,
                hc.monthly_slcsp_premium,
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

            aca_details.append(
                AcaSubsidyDetail(
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
                )
            )

        yearly_detail.append(detail)
        bracket_fill = analyze_bracket_fill(effective_income, conversion, scenario.filing_status)
        yearly_bracket_fill.append(bracket_fill)

        # Advance balance for next year's RMD computation
        available_for_conv = max(0.0, trad_balance - rmd)
        actual_conv = min(conversion, available_for_conv)
        trad_balance -= rmd
        trad_balance -= actual_conv
        trad_balance *= 1 + scenario.annual_growth_rate

    return yearly_detail, yearly_bracket_fill, total_tax, aca_details


def _build_irmaa_projection(
    scenario: ScenarioInput,
    conversions: list[float],
) -> IrmaaProjection | None:
    """Build IRMAA surcharge projection for a given conversion schedule."""
    n_years = len(scenario.timeline)
    irmaa_exposed = _irmaa_exposed_years(scenario)
    owner_rmd_start = rmd_start_age(scenario.age)

    trad_balance = scenario.traditional_ira_balance
    yearly_detail: list[IrmaaYearDetail] = []

    for t in range(n_years):
        if t not in irmaa_exposed:
            trad_balance *= 1 + scenario.annual_growth_rate
            continue

        entry = scenario.timeline[t]
        income = entry.gross_income
        owner_age = scenario.age + t
        conversion = conversions[t]

        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, trad_balance)
        effective_income = income + rmd
        magi = effective_income + conversion

        irmaa_cost = calculate_irmaa(magi, scenario.filing_status)
        tier = irmaa_tier_index(magi, scenario.filing_status)

        if irmaa_cost > 0:
            yearly_detail.append(
                IrmaaYearDetail(
                    conversion_year=entry.year,
                    surcharge_year=entry.year + IRMAA_LOOKBACK_YEARS,
                    surcharge_age=owner_age + IRMAA_LOOKBACK_YEARS,
                    magi=round(magi, 2),
                    irmaa_annual_cost=round(irmaa_cost, 2),
                    irmaa_tier=tier,
                )
            )

        available_for_conv = max(0.0, trad_balance - rmd)
        actual_conv = min(conversion, available_for_conv)
        trad_balance -= rmd
        trad_balance -= actual_conv
        trad_balance *= 1 + scenario.annual_growth_rate

    if not yearly_detail:
        return None

    total_cost = sum(d.irmaa_annual_cost for d in yearly_detail)
    peak = max(yearly_detail, key=lambda d: d.irmaa_annual_cost)

    return IrmaaProjection(
        yearly_detail=yearly_detail,
        total_irmaa_cost=round(total_cost, 2),
        peak_irmaa_year=peak.surcharge_year,
        peak_irmaa_amount=peak.irmaa_annual_cost,
    )


def compute_conversion_curve(
    scenario: ScenarioInput,
    n_points: int = 25,
) -> list[ConversionCurvePoint]:
    """Run optimizer at multiple total conversion caps to power the slider."""
    max_balance = scenario.traditional_ira_balance
    n_years = len(scenario.timeline)

    if n_years > 15:
        n_points = min(n_points, 6)
    elif n_years > 10:
        n_points = min(n_points, 10)

    cached_greedy = greedy_bracket_fill(scenario)
    points = []

    for cap in np.linspace(0, max_balance, n_points):
        cap = round_to_resolution(cap)

        if cap == 0:
            conversions = [0.0] * n_years
        else:
            conversions = _run_scipy_light(scenario, cap, cached_greedy=cached_greedy)

        yearly_detail, yearly_bracket_fill, total_tax, _ = _build_year_detail(
            scenario,
            conversions,
        )
        npv = calculate_npv(scenario, conversions)

        points.append(
            ConversionCurvePoint(
                total_cap=cap,
                yearly_conversions=conversions,
                yearly_bracket_fill=yearly_bracket_fill,
                yearly_detail=yearly_detail,
                total_tax=round(total_tax, 2),
                npv=round(npv, 2),
            )
        )

    return points


def _build_rmd_projection(
    scenario: ScenarioInput,
    conversions: list[float],
) -> RmdProjection | None:
    """Project RMD amounts and taxes across the full plan (timeline + post-timeline)."""
    n_years = len(scenario.timeline)
    g = scenario.annual_growth_rate
    filing_status = scenario.filing_status

    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance

    # Apply timeline conversions and track balance
    owner_rmd_start = rmd_start_age(scenario.age)
    first_year = scenario.timeline[0].year
    yearly_detail: list[RmdYearDetail] = []
    total_rmd_taxes = 0.0
    ret_state = scenario.retirement_state or scenario.state

    for t in range(n_years):
        entry = scenario.timeline[t]
        owner_age = scenario.age + t
        calendar_year = entry.year

        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, trad_balance)

        if rmd > 0:
            tax = calculate_federal_tax(rmd, filing_status)
            if ret_state:
                tax += calculate_state_tax(rmd, ret_state, filing_status, scenario.custom_state_rate)
            eff_rate = tax / rmd

            yearly_detail.append(
                RmdYearDetail(
                    year=calendar_year,
                    age=owner_age,
                    trad_balance_start=round(trad_balance, 2),
                    rmd_amount=round(rmd, 2),
                    actual_distribution=round(rmd, 2),
                    tax_on_distribution=round(tax, 2),
                    effective_rate=round(eff_rate, 4),
                )
            )
            total_rmd_taxes += tax

        available_for_conv = max(0.0, trad_balance - rmd)
        actual_conv = min(max(0.0, conversions[t]), available_for_conv)
        trad_balance -= rmd
        trad_balance -= actual_conv
        roth_balance += actual_conv
        trad_balance *= 1 + g
        roth_balance *= 1 + g

    # Post-timeline fallback
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    phase3_start = max(n_years, years_until_drawdown)

    extra_growth = phase3_start - n_years
    if extra_growth > 0:
        trad_balance *= (1 + g) ** extra_growth
        roth_balance *= (1 + g) ** extra_growth

    spending = scenario.default_drawdown
    if spending is None:
        spending = (trad_balance + roth_balance) * RETIREMENT_SPENDING_RATE

    total_plan_years = scenario.planning_horizon_age - scenario.age

    for year_offset in range(1, total_plan_years - phase3_start + 1):
        year = phase3_start + year_offset
        owner_age = scenario.age + year
        calendar_year = first_year + year

        pre_growth_trad = trad_balance
        trad_balance *= 1 + g
        roth_balance *= 1 + g

        rmd = (
            calculate_rmd(pre_growth_trad, owner_age) if owner_age >= owner_rmd_start else 0.0
        )

        if rmd <= 0:
            distribution = min(spending, trad_balance)
        else:
            distribution = max(rmd, min(spending, trad_balance))
            distribution = min(distribution, trad_balance)

        trad_balance -= distribution

        tax = calculate_federal_tax(distribution, filing_status)
        if ret_state:
            tax += calculate_state_tax(
                distribution, ret_state, filing_status, scenario.custom_state_rate
            )

        eff_rate = tax / distribution if distribution > 0 else 0.0

        if rmd > 0:
            yearly_detail.append(
                RmdYearDetail(
                    year=calendar_year,
                    age=owner_age,
                    trad_balance_start=round(pre_growth_trad, 2),
                    rmd_amount=round(rmd, 2),
                    actual_distribution=round(distribution, 2),
                    tax_on_distribution=round(tax, 2),
                    effective_rate=round(eff_rate, 4),
                )
            )
            total_rmd_taxes += tax

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


def _build_irmaa_summary(
    with_conversion: IrmaaProjection | None,
    without_conversion: IrmaaProjection | None,
) -> dict | None:
    """Build a human-readable summary of IRMAA impact for the AI explanation layer."""
    if with_conversion is None and without_conversion is None:
        return None

    summary: dict = {}

    if without_conversion:
        summary["total_irmaa_no_conversion"] = without_conversion.total_irmaa_cost
        summary["peak_irmaa_no_conversion"] = without_conversion.peak_irmaa_amount

    if with_conversion:
        summary["total_irmaa_with_conversion"] = with_conversion.total_irmaa_cost
        summary["peak_irmaa_with_conversion"] = with_conversion.peak_irmaa_amount

    if with_conversion and without_conversion:
        additional = with_conversion.total_irmaa_cost - without_conversion.total_irmaa_cost
        summary["irmaa_additional_cost"] = round(additional, 2)

    if with_conversion and with_conversion.total_irmaa_cost > 0:
        summary["explanation"] = (
            f"Medicare surcharges (IRMAA) are triggered when income exceeds $206,000 (MFJ) "
            f"or $103,000 (single). The recommended conversions are projected to incur "
            f"${with_conversion.total_irmaa_cost:,.0f} in total IRMAA surcharges, "
            f"factored into the optimization."
        )
    else:
        summary["explanation"] = (
            "The recommended conversions keep income below IRMAA thresholds, "
            "avoiding Medicare premium surcharges."
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
    n_years = len(scenario.timeline)
    max_balance = scenario.traditional_ira_balance
    total_conversion = sum(final_conversions)
    timeline_years = [yi.year for yi in scenario.timeline]

    full_conversions = [max_balance] + [0.0] * (n_years - 1)
    npv_at_full = calculate_npv(scenario, full_conversions)

    yr0_income = scenario.timeline[0].gross_income
    yr0_state = resolve_state_for_year(scenario.timeline[0].state, scenario.state)
    tax_full = federal_tax_on_conversion(yr0_income, max_balance, scenario.filing_status)
    tax_full += state_tax_on_conversion(
        yr0_income,
        max_balance,
        yr0_state,
        scenario.filing_status,
        scenario.custom_state_rate,
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
    """Find the optimal multi-year conversion schedule."""
    from app.engine.curve_strategy import generate_conversion_curve
    from app.engine.dp import dp_optimize

    n_years = len(scenario.timeline)
    max_balance = scenario.traditional_ira_balance

    dp_result = dp_optimize(scenario)
    unconstrained_conversions = dp_result.yearly_conversions
    unconstrained_npv = dp_result.npv

    if _has_active_preferences(scenario):
        prefs = scenario.conversion_preferences
        constrained_bounds, constrained_constraints = _build_constrained_params(
            scenario,
            prefs,
            unconstrained_conversions,
        )
        raw_constrained = _run_scipy(scenario, constrained_bounds, constrained_constraints)
        final_conversions = _finalize_conversions(
            raw_constrained, max_balance, scenario.annual_growth_rate
        )
    else:
        final_conversions = unconstrained_conversions

    total_conversion = sum(final_conversions)

    conversion_curve = generate_conversion_curve(scenario, curve_max=total_conversion)

    npv_at_optimal = calculate_npv(scenario, final_conversions)
    npv_at_zero = calculate_npv(scenario, [0.0] * n_years)

    yearly_detail, yearly_bracket_fill, total_tax, aca_details = _build_year_detail(
        scenario,
        final_conversions,
    )

    timeline_chart = []
    trad_balance = scenario.traditional_ira_balance
    roth_balance = scenario.roth_ira_balance
    g = scenario.annual_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age)

    for t in range(n_years):
        entry = scenario.timeline[t]
        income = entry.gross_income
        owner_age = scenario.age + t
        c_t = final_conversions[t]

        rmd = calculate_rmd(trad_balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, trad_balance)

        bracket_fill = yearly_bracket_fill[t]
        timeline_chart.append(
            {
                "year": entry.year,
                "income": income,
                "rmd": round(rmd, 2),
                "conversion": c_t,
                "bracket_boundaries": [b.bracket_max for b in bracket_fill],
            }
        )

        available_for_conv = max(0.0, trad_balance - rmd)
        actual_conv = min(c_t, available_for_conv)
        trad_balance -= rmd
        trad_balance -= actual_conv
        roth_balance += actual_conv
        trad_balance *= 1 + g
        roth_balance *= 1 + g

    # Project to drawdown start
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    phase3_start = max(n_years, years_until_drawdown)
    extra_growth = phase3_start - n_years
    if extra_growth > 0:
        factor = (1 + g) ** extra_growth
        trad_balance *= factor
        roth_balance *= factor

    overall_eff_rate = total_tax / total_conversion if total_conversion > 0 else 0.0

    scenarios = _build_scenarios(
        scenario,
        final_conversions,
        total_tax,
        npv_at_optimal,
        npv_at_zero,
    )

    npv_curve: list[NPVCurvePoint] = []
    for frac in np.linspace(0, 1, 20):
        amt = frac * max_balance
        test_conversions = [amt] + [0.0] * (n_years - 1)
        npv_val = calculate_npv(scenario, test_conversions)
        npv_curve.append(NPVCurvePoint(conversion_amount=amt, npv=npv_val))

    from app.engine.trace import generate_reasoning_trace

    reasoning = generate_reasoning_trace(
        scenario,
        final_conversions,
        yearly_bracket_fill,
        npv_curve,
        aca_details=aca_details,
    )

    result_unconstrained_npv = None
    result_unconstrained_conversions = None
    if _has_active_preferences(scenario) and unconstrained_conversions != final_conversions:
        result_unconstrained_npv = round(unconstrained_npv, 2)
        result_unconstrained_conversions = unconstrained_conversions

    npv_without_aca = None
    total_subsidy_lost = None
    cliff_income = None
    if scenario.healthcare and aca_details:
        scenario_no_aca = scenario.model_copy(update={"healthcare": None})
        npv_without_aca = round(calculate_npv(scenario_no_aca, final_conversions), 2)
        total_subsidy_lost = round(sum(d.subsidy_lost for d in aca_details), 2)
        cliff_income = round(find_subsidy_cliff_income(scenario.healthcare.household_size), 2)

    rmd_projection = _build_rmd_projection(scenario, final_conversions)
    rmd_projection_no_conv = _build_rmd_projection(scenario, [0.0] * n_years)

    reasoning.rmd_summary = _build_rmd_summary(rmd_projection, rmd_projection_no_conv)

    irmaa_projection = _build_irmaa_projection(scenario, final_conversions)
    irmaa_projection_no_conv = _build_irmaa_projection(scenario, [0.0] * n_years)
    reasoning.irmaa_summary = _build_irmaa_summary(irmaa_projection, irmaa_projection_no_conv)

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
        irmaa_projection=irmaa_projection,
        irmaa_projection_no_conversion=irmaa_projection_no_conv,
        input=scenario,
    )
