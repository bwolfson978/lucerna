import numpy as np
from scipy.optimize import minimize

from app.engine.aca import (
    calculate_aca_subsidy,
    find_subsidy_cliff_income,
)
from app.engine.cashflow import Plan, YearFlow, plan_for, walk
from app.engine.constants import (
    IMPROVEMENT_THRESHOLD,
    ROUNDING_RESOLUTION,
    round_to_resolution,
)
from app.engine.early_withdrawal import (
    CONVERSION_SEASONING_YEARS,
    EARLY_WITHDRAWAL_PENALTY,
    age_59_half,
    has_early_spending,
    penalty_free_draws,
)
from app.engine.heuristic import greedy_bracket_fill
from app.engine.irmaa import (
    IRMAA_LOOKBACK_YEARS,
    IRMAA_TIERS,
    calculate_irmaa,
    irmaa_tier_index,
)
from app.engine.retirement import post_timeline_start, resolve_states
from app.engine.rmd import rmd_start_age
from app.engine.state_tax import resolve_state_for_year
from app.engine.tax import (
    STANDARD_DEDUCTION,
    analyze_bracket_fill,
)
from app.engine.tax_cost import (
    combined_marginal_rate,
    federal_tax_on_conversion,
    state_tax_on_conversion,
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
from app.engine.year_tax import year_tax


def calculate_npv(scenario: ScenarioInput, yearly_conversions: list[float]) -> float:
    """Today's value of a conversion schedule: what the accounts provide after tax
    over the plan plus what is left at the end (see ``app.engine.cashflow``)."""
    return walk(scenario, yearly_conversions).value


def _subsidy_lost(plan: Plan, flow: YearFlow) -> tuple[float, float]:
    """ACA premium credit without and with the year's conversion, which is the top
    slice of the year's income."""
    hc = plan.scenario.healthcare
    if not flow.rule.aca or hc is None:
        return 0.0, 0.0
    without = calculate_aca_subsidy(flow.base_income, hc.household_size, hc.monthly_slcsp_premium)
    return without, flow.subsidy


def _irmaa_added(plan: Plan, flow: YearFlow) -> float:
    """Medicare surcharge the year's conversion adds, two years on."""
    tax = flow.rule.tax
    if tax.medicare_people <= 0 or flow.conversion <= 0:
        return 0.0
    without = calculate_irmaa(
        tax.agi(flow.base_income),
        plan.scenario.filing_status,
        tax.irmaa_scale,
        tax.medicare_people,
    )
    return max(0.0, flow.irmaa - without)


def _npv_parts(scenario: ScenarioInput, yearly_conversions: list[float]) -> tuple[float, float]:
    """Value of a conversion schedule, plus what the conversions cost when they
    happen (tax, lost ACA subsidy, IRMAA), brought back to today the same way."""
    plan = plan_for(scenario)
    walked = plan.walk(yearly_conversions)
    upfront_cost = 0.0
    for flow in walked.timeline():
        if flow.conversion <= 0:
            continue
        tax = flow.rule.tax.total
        cost = flow.tax - tax(flow.base_income)
        without, with_conversion = _subsidy_lost(plan, flow)
        cost += max(0.0, without - with_conversion)
        upfront_cost += cost * plan.discount(flow.rule.index)
        upfront_cost += _irmaa_added(plan, flow) * plan.discount(
            flow.rule.index + IRMAA_LOOKBACK_YEARS
        )
    return walked.value, upfront_cost


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
                _yt=year_tax(scenario, t),
            ):
                cost = federal_tax_on_conversion(_income, x[_t], _fs, _yt)
                cost += state_tax_on_conversion(_income, x[_t], _yr_state, _fs, _custom_rate, _yt)
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
    """Build per-year detail and bracket fill data for a given conversion schedule.

    The conversion is the top slice of what the year is taxed on: its tax, lost ACA
    subsidy and added IRMAA are measured on top of income, the RMD and the
    traditional withdrawal that funds the year's spending and tax.
    """
    plan = plan_for(scenario)
    hc = scenario.healthcare
    yearly_detail = []
    yearly_bracket_fill: list[list[BracketFillResult]] = []
    total_tax = 0.0
    aca_details: list[AcaSubsidyDetail] | None = [] if hc else None

    from app.engine.aca import federal_poverty_level

    for flow in plan.walk(conversions).timeline():
        rule = flow.rule
        yt = rule.tax
        base, added = flow.base_income, flow.conversion

        fed_cost = federal_tax_on_conversion(base, added, scenario.filing_status, yt)
        state_cost = state_tax_on_conversion(
            base, added, yt.state, scenario.filing_status, scenario.custom_state_rate, yt
        )
        tax_cost = fed_cost + state_cost
        total_tax += tax_cost

        eff_rate = tax_cost / added if added > 0 else 0.0
        marginal = combined_marginal_rate(
            base,
            added,
            scenario.filing_status,
            state=yt.state,
            custom_state_rate=scenario.custom_state_rate,
            year=yt,
        )
        fed_marginal = yt.federal_bracket(base + added)

        # Where the conversion's tax comes from. A working household pays it out of
        # income; one that is spending from its accounts pays it out of income only
        # as far as income is left over after the budget, and the accounts pay the rest.
        if rule.budget is None:
            tax_from_income = tax_cost
        else:
            income_left = rule.income + flow.rmd - rule.budget
            income_left -= yt.total(rule.income + flow.rmd)
            tax_from_income = min(tax_cost, max(0.0, income_left))

        irmaa_tier = 0
        if yt.medicare_people > 0:
            irmaa_tier = irmaa_tier_index(
                yt.agi(base + added), scenario.filing_status, yt.irmaa_scale
            )

        detail: dict = {
            "year": rule.year,
            "income": rule.income,
            "rmd": round(flow.rmd, 2),
            "conversion": added,
            # After-tax spending the household funds this year (None while working),
            # and the withdrawals that pay for it and for the year's tax
            "spending": None if rule.budget is None else round(rule.budget, 2),
            "spending_from_traditional": round(flow.trad_draw, 2),
            "spending_from_roth": round(flow.spending_from_roth, 2),
            "spending_shortfall": round(flow.shortfall, 2),
            "early_withdrawal_penalty": round(flow.penalty, 2),
            # The year's whole income tax bill, and the conversion's part of it
            "total_tax": round(flow.tax, 2),
            "tax_cost": round(tax_cost, 2),
            "federal_tax_cost": round(fed_cost, 2),
            "state_tax_cost": round(state_cost, 2),
            "tax_paid_from_income": round(tax_from_income, 2),
            "effective_rate": round(eff_rate, 4),
            # What the federal brackets apply to, conversion and withdrawals included
            "taxable_income": round(yt.taxable_income(base + added), 2),
            # Under the standard deduction the conversion is not taxed federally at all
            "marginal_bracket": "0%"
            if yt.under_standard_deduction(base + added, STANDARD_DEDUCTION[scenario.filing_status])
            else f"{fed_marginal:.0%}",
            "state_marginal_rate": round(
                marginal - fed_marginal,
                4,
            ),
            "irmaa_cost": round(_irmaa_added(plan, flow), 2),
            "irmaa_tier": irmaa_tier,
        }

        if hc and rule.aca:
            subsidy_without, subsidy_with = _subsidy_lost(plan, flow)
            subsidy_lost = max(0.0, subsidy_without - subsidy_with)
            combined_cost_val = tax_cost + subsidy_lost
            combined_rate_val = combined_cost_val / added if added > 0 else 0.0
            fpl = federal_poverty_level(hc.household_size)
            income_pct_fpl = ((base + added) / fpl) * 100
            # The conversion pushes income over 400% FPL and wipes out a subsidy
            # the household would otherwise get
            hits_cliff = income_pct_fpl > 400 and subsidy_without > 0

            detail["subsidy_lost"] = round(subsidy_lost, 2)
            detail["combined_cost"] = round(combined_cost_val, 2)
            detail["combined_rate"] = round(combined_rate_val, 4)

            aca_details.append(
                AcaSubsidyDetail(
                    year=rule.year,
                    magi_without_conversion=base,
                    magi_with_conversion=base + added,
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
        yearly_bracket_fill.append(analyze_bracket_fill(base, added, scenario.filing_status))

    return yearly_detail, yearly_bracket_fill, total_tax, aca_details


def _build_irmaa_projection(
    scenario: ScenarioInput,
    conversions: list[float],
) -> IrmaaProjection | None:
    """Build IRMAA surcharge projection for a given conversion schedule."""
    yearly_detail: list[IrmaaYearDetail] = []
    for flow in walk(scenario, conversions).timeline():
        if flow.irmaa <= 0:
            continue
        rule = flow.rule
        # Income, RMD, conversion and the traditional withdrawal for spending and tax
        magi = rule.tax.agi(flow.taxed_income)
        yearly_detail.append(
            IrmaaYearDetail(
                conversion_year=rule.year,
                surcharge_year=rule.year + IRMAA_LOOKBACK_YEARS,
                surcharge_age=rule.age + IRMAA_LOOKBACK_YEARS,
                magi=round(magi, 2),
                irmaa_annual_cost=round(flow.irmaa, 2),
                irmaa_tier=irmaa_tier_index(magi, scenario.filing_status, rule.tax.irmaa_scale),
            )
        )

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
    yearly_detail: list[RmdYearDetail] = []
    total_rmd_taxes = 0.0

    for flow in walk(scenario, conversions).flows:
        if flow.rmd <= 0:
            continue
        rule = flow.rule
        # The RMD plus anything withdrawn on top of it, taxed on top of income
        distribution = flow.rmd + flow.trad_draw
        tax = float(rule.tax.total(rule.income + distribution)) - rule.tax_on_income
        yearly_detail.append(
            RmdYearDetail(
                year=rule.year,
                age=rule.age,
                trad_balance_start=round(flow.trad_start, 2),
                rmd_amount=round(flow.rmd, 2),
                actual_distribution=round(distribution, 2),
                tax_on_distribution=round(tax, 2),
                effective_rate=round(tax / distribution, 4),
            )
        )
        total_rmd_taxes += tax

    if not yearly_detail:
        return None

    peak_detail = max(yearly_detail, key=lambda d: d.rmd_amount)

    return RmdProjection(
        rmd_start_age=rmd_start_age(scenario.age, scenario.timeline[0].year),
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
        summary["rmd_start_year"] = without_conversion.rmd_start_year
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


_MONTHS = (  # noqa: SIM905
    "January February March April May June July August September October November December"
).split()


def _build_early_withdrawal_summary(
    scenario: ScenarioInput, yearly_detail: list[dict], conversions: list[float]
) -> dict | None:
    """When 59½ is reached and what spending before then pays in penalties, with and
    without the conversions, for the AI explanation layer."""
    if not has_early_spending(scenario):
        return None
    year, month = age_59_half(scenario)
    no_conversion, _, _, _ = _build_year_detail(scenario, [0.0] * len(conversions))
    with_conv = sum(d["early_withdrawal_penalty"] for d in yearly_detail)
    without_conv = sum(d["early_withdrawal_penalty"] for d in no_conversion)
    free = penalty_free_draws(scenario, conversions)
    reached = f"{_MONTHS[month - 1]} {year}" if scenario.birth_month else str(year)
    return {
        "age_59_half_year": year,
        "age_59_half_month": month if scenario.birth_month else None,
        "penalty_rate": EARLY_WITHDRAWAL_PENALTY,
        "total_penalty_with_conversion": round(with_conv, 2),
        "total_penalty_no_conversion": round(without_conv, 2),
        "penalty_by_year": [
            {"year": d["year"], "penalty": d["early_withdrawal_penalty"]}
            for d in yearly_detail
            if d["early_withdrawal_penalty"] > 0
        ],
        "penalty_free_roth_by_year": [
            {"year": scenario.timeline[t].year, "amount": round(amount, 2)}
            for t, amount in enumerate(free)
            if amount > 0
        ],
        "not_modeled": ["rule of 55", "72(t) substantially equal payments"],
        "explanation": (
            f"Withdrawals from retirement accounts before age 59½ (reached {reached}) "
            f"pay a {EARLY_WITHDRAWAL_PENALTY:.0%} additional tax. Conversions are not "
            "penalized. Before 59½ the analysis pays for spending with penalty-free Roth "
            "money first: the existing Roth balance, then conversions at least five years "
            "old. Early withdrawal penalties total "
            f"${with_conv:,.0f} with the conversion schedule and ${without_conv:,.0f} "
            "without conversions, in today's dollars, added up as paid."
        ),
    }


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
            f"Medicare surcharges (IRMAA) are triggered when income exceeds "
            f"${IRMAA_TIERS[0]['mfj_max']:,.0f} (MFJ) "
            f"or ${IRMAA_TIERS[0]['single_max']:,.0f} (single). The recommended conversions are projected to incur "
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

    # What the account can fund in year one, and the tax on it
    tax_full = _build_year_detail(scenario, full_conversions)[2]

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


# Curve points within this fraction of the optimal total also try the optimal schedule,
# scaled to their total.
ENVELOPE_SPAN = 0.5


def _with_optimal_schedule(
    scenario: ScenarioInput,
    curve: list[ConversionCurvePoint],
    final_conversions: list[float],
    *,
    envelope: bool = True,
) -> list[ConversionCurvePoint]:
    """Put the optimizer's own schedule on the conversion curve.

    The curve strategy builds each point its own way, so near the optimal total its
    points can sit well below the optimizer's answer and the slider dips just beside
    the optimum. The optimal schedule becomes a point of its own, and points near it
    keep whichever is better: their own allocation or the optimal schedule scaled to
    their total (both real allocations of that total). Skipped with ``envelope=False``
    (user preferences), where a scaled-up schedule could break a per-year limit.
    """
    from app.engine.curve_strategy import build_curve_point  # lazy: avoids a cycle

    total = sum(final_conversions)
    if not curve or total <= 0:
        return curve
    balance = scenario.traditional_ira_balance
    points = []
    for point in curve:
        cap = point.total_cap
        if abs(cap - total) < 1:
            continue
        if envelope and abs(cap - total) <= total * ENVELOPE_SPAN and cap > 0:
            scaled = _finalize_conversions(
                [c * cap / total for c in final_conversions], balance, scenario.real_growth_rate
            )
            fits = abs(sum(scaled) - cap) <= ROUNDING_RESOLUTION * len(scaled)
            if fits and calculate_npv(scenario, scaled) > point.npv + 1.0:
                point = build_curve_point(scenario, cap, scaled)
        points.append(point)
    points.append(build_curve_point(scenario, round(total, 2), list(final_conversions)))
    return sorted(points, key=lambda p: p.total_cap)


def _with_conversion_ladder(scenario: ScenarioInput, conversions: list[float]) -> list[float]:
    """Try converting enough to pay for spending five years later, before 59½.

    A conversion becomes penalty-free money five years on (a Roth conversion
    ladder). The DP only credits that approximately, so this tries ladders of
    several sizes on top of the schedule and keeps the best by exact NPV. Returns
    ``conversions`` itself when nothing beats it.
    """
    if not has_early_spending(scenario):
        return conversions
    plan = plan_for(scenario)
    n_years = plan.n_timeline
    # Spending each year takes from the accounts with the penalty when nothing is converted
    penalized = [flow.trad_draw + flow.roth_draw for flow in plan.no_conversion.timeline()]
    caps: dict[int, float] = {}
    for t in range(n_years - CONVERSION_SEASONING_YEARS):
        later = t + CONVERSION_SEASONING_YEARS
        if penalized[later] > 0 and plan.years[later].penalty_rate > 0:
            caps[t] = penalized[later]
    if not caps:
        return conversions
    retired = [t for t in caps if plan.years[t].budget is not None]
    best, best_npv = conversions, calculate_npv(scenario, conversions)
    for years in {tuple(retired), tuple(caps)}:
        for step in range(1, 11):
            share = step / 10
            candidate = list(conversions)
            for t in years:
                candidate[t] = max(candidate[t], share * caps[t])
            npv = calculate_npv(scenario, candidate)
            if npv > best_npv + 1.0:
                best, best_npv = candidate, npv
    return best


# The search's traditional grid has this many points up to today's balance (see dp.py)
_GRID_POINTS_TO_BALANCE = 160


# A conversion has to earn its place: one that adds less than this per dollar
# converted (a hundredth of a percent) is left out. Real differences are whole
# percentage points of tax, so this only separates "no gain" from "a gain".
_IDLE_GAIN_PER_DOLLAR = 1e-4


def _refine_within_grid(scenario: ScenarioInput, conversions: list[float]) -> list[float]:
    """Settle each year's conversion between the search's grid points, and drop
    conversions that gain nothing.

    The search places every conversion on a grid, about $16,000 apart for a $2.6M
    balance, so a year can sit half a step from where it should. And where a
    household pays the same rate now as later, converting changes nothing, so the
    search has no reason to prefer any amount there and returns an arbitrary one.

    This first leaves out each year's conversion that the plan is no worse without,
    then moves one year at a time up or down by a shrinking step and keeps what the
    exact value prefers, taking the smaller conversion when the two are equal.
    Returns ``conversions`` itself when nothing beats it.
    """
    plan = plan_for(scenario)
    grid_step = scenario.traditional_ira_balance / _GRID_POINTS_TO_BALANCE
    best, best_value = conversions, plan.walk(conversions).value

    def try_move(t: int, amount: float) -> bool:
        nonlocal best, best_value
        candidate = list(best)
        candidate[t] = amount
        value = plan.walk(candidate).value
        change = amount - best[t]
        if change < 0:
            accepted = value >= best_value + _IDLE_GAIN_PER_DOLLAR * change
        else:
            accepted = value > best_value + max(1.0, _IDLE_GAIN_PER_DOLLAR * change)
        if accepted:
            best, best_value = candidate, value
        return accepted

    def drop_idle() -> None:
        # Leaving one out can make another idle, so go round until none is
        for _ in range(plan.n_timeline):
            if not any([best[t] > 0 and try_move(t, 0.0) for t in range(plan.n_timeline)]):
                break

    drop_idle()
    for step in (grid_step, grid_step / 2, grid_step / 4, grid_step / 8):
        if step < ROUNDING_RESOLUTION:
            break
        for _ in range(3):
            moved = False
            for t in range(plan.n_timeline):
                if (
                    best[t] > 0
                    and try_move(t, max(0.0, best[t] - step))
                    or try_move(t, best[t] + step)
                ):
                    moved = True
            if not moved:
                break
    drop_idle()
    return best


def optimize(scenario: ScenarioInput) -> OptimizationResult:
    """Find the optimal multi-year conversion schedule."""
    from app.engine.curve_strategy import generate_conversion_curve
    from app.engine.dp import dp_optimize

    original = scenario
    scenario = resolve_states(scenario)
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
            raw_constrained, max_balance, scenario.real_growth_rate
        )
    else:
        final_conversions = unconstrained_conversions

    total_conversion = sum(final_conversions)

    conversion_curve = generate_conversion_curve(scenario, curve_max=total_conversion)

    # Defense-in-depth: the bracket-fill curve evaluates calculate_npv at
    # every cap point, so its peak is always an authoritative NPV value.
    # If it strictly beats the DP result (possible on coarse grids or in
    # edge cases not yet covered by the 2D DP), promote it.
    # Only for unconstrained scenarios — the curve ignores user preferences
    # (max_per_year, tax caps, etc.) and must not override constraint-
    # respecting scipy results.
    if conversion_curve and not _has_active_preferences(scenario):
        best_curve_point = max(conversion_curve, key=lambda p: p.npv)
        current_npv = calculate_npv(scenario, final_conversions)
        if best_curve_point.npv > current_npv + 1.0:
            final_conversions = _finalize_conversions(
                list(best_curve_point.yearly_conversions),
                max_balance,
                scenario.real_growth_rate,
            )
            total_conversion = sum(final_conversions)

    if not _has_active_preferences(scenario):
        laddered = _with_conversion_ladder(scenario, final_conversions)
        if laddered is not final_conversions:
            final_conversions = _finalize_conversions(
                laddered, max_balance, scenario.real_growth_rate
            )
            total_conversion = sum(final_conversions)

        refined = _refine_within_grid(scenario, final_conversions)
        if refined is not final_conversions:
            final_conversions = _finalize_conversions(
                refined, max_balance, scenario.real_growth_rate
            )
            total_conversion = sum(final_conversions)

    # The answer lists what the account can fund in each year (it is taxed and valued
    # that way): a year converts no more than is left after its RMD
    walked = walk(scenario, final_conversions)
    final_conversions = [flow.conversion for flow in walked.timeline()]
    total_conversion = sum(final_conversions)

    conversion_curve = _with_optimal_schedule(
        scenario,
        conversion_curve,
        final_conversions,
        envelope=not _has_active_preferences(scenario),
    )

    npv_at_optimal, upfront_cost = _npv_parts(scenario, final_conversions)
    npv_at_zero = calculate_npv(scenario, [0.0] * n_years)

    yearly_detail, yearly_bracket_fill, total_tax, aca_details = _build_year_detail(
        scenario,
        final_conversions,
    )

    flows = walk(scenario, final_conversions).flows
    timeline_chart = [
        {
            "year": flow.rule.year,
            "income": flow.rule.income,
            "rmd": round(flow.rmd, 2),
            "conversion": flow.conversion,
            "bracket_boundaries": [b.bracket_max for b in yearly_bracket_fill[t]],
        }
        for t, flow in enumerate(flows[:n_years])
    ]

    # Balances when drawdowns begin ("at retirement"), or after the timeline if later
    drawdown_offset = scenario.drawdown_start_age - scenario.age
    if 0 < drawdown_offset < n_years:
        trad_balance = flows[drawdown_offset].trad_start
        roth_balance = flows[drawdown_offset].roth_start
    else:
        before_withdrawals = flows[max(n_years, post_timeline_start(scenario)) - 1]
        trad_balance = before_withdrawals.trad_end
        roth_balance = before_withdrawals.roth_end

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
        lifetime_savings=npv_at_optimal - npv_at_zero,
        conversion_cost_today=upfront_cost,
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
    reasoning.early_withdrawal_summary = _build_early_withdrawal_summary(
        scenario, yearly_detail, final_conversions
    )

    return OptimizationResult(
        yearly_conversions=final_conversions,
        total_conversion=total_conversion,
        total_tax_on_conversions=round(total_tax, 2),
        overall_effective_rate=round(overall_eff_rate, 4),
        estimated_lifetime_tax_savings=round(npv_at_optimal - npv_at_zero, 2),
        npv_at_optimal=round(npv_at_optimal, 2),
        npv_at_zero=round(npv_at_zero, 2),
        conversion_cost_today=round(upfront_cost, 2),
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
        input=original,
    )
