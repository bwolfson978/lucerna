from app.engine.aca import find_subsidy_cliff_income
from app.engine.cashflow import plan_for, walk
from app.engine.constants import (
    BRACKET_FULL_THRESHOLD,
    FULLY_CONVERTED_SHARE,
    HIGH_GROWTH_RATE,
    IRMAA_NEAR_THRESHOLD,
    LARGE_BALANCE_THRESHOLD,
    LARGE_INCOME_VARIATION,
    LONG_RETIREMENT_YEARS,
    LOW_GROWTH_RATE,
    ROUNDING_RESOLUTION,
)
from app.engine.irmaa import (
    IRMAA_LOOKBACK_YEARS,
    IRMAA_TIERS,
    MEDICARE_START_AGE,
    lookback_threshold_scale,
)
from app.engine.retirement import conversion_bases
from app.engine.rmd import rmd_start_age
from app.engine.state_tax import resolve_state_for_year, retirement_rule, state_name
from app.engine.tax import BRACKETS
from app.engine.tax_cost import (
    combined_marginal_rate,
    state_tax_on_conversion,
    total_conversion_cost,
)
from app.engine.types import (
    AcaSubsidyDetail,
    BracketFillResult,
    FilingStatus,
    NPVCurvePoint,
    ReasoningTrace,
    ScenarioInput,
)
from app.engine.year_tax import year_tax

# Below this a state's marginal rate on conversions counts as no state tax
MIN_STATE_RATE = 0.0005

# The extra conversion priced in ``_cost_of_converting_more``
EXTRA_CONVERSION = 1000


def generate_reasoning_trace(
    scenario: ScenarioInput,
    optimal_conversions: list[float],
    bracket_fill: list[list[BracketFillResult]],
    npv_curve: list[NPVCurvePoint],
    aca_details: list[AcaSubsidyDetail] | None = None,
    lifetime_savings: float | None = None,
    conversion_cost_today: float | None = None,
) -> ReasoningTrace:
    """Generate a structured reasoning trace for the AI explanation layer.

    Analyzes the optimization result and produces a human-readable explanation
    of why the optimal conversion amounts are what they are.

    ``lifetime_savings`` is the plan's headline savings (NPV of the schedule
    minus NPV of not converting). Pass it so the summary quotes the same number
    as the headline; ``npv_curve`` only tests year-one conversions.
    ``conversion_cost_today`` is what the conversions cost when they happen, in
    today's dollars, so tax paid and tax avoided add up to the savings.
    """
    # Find binding constraint
    # Income before each conversion, counting the traditional withdrawal for spending
    bases = conversion_bases(scenario, optimal_conversions)

    binding_constraint = _find_binding_constraint(
        scenario, optimal_conversions, bracket_fill, bases
    )

    # NPV benefit
    if lifetime_savings is not None:
        marginal_benefit = lifetime_savings
    else:
        npv_at_zero = npv_curve[0].npv if npv_curve else 0.0
        npv_at_optimal = max((p.npv for p in npv_curve), default=0.0)
        marginal_benefit = npv_at_optimal - npv_at_zero

    # Cost/benefit of brackets
    cost_of_more = _cost_of_converting_more(scenario, optimal_conversions, bases)
    cost_and_benefit = _cost_and_benefit_of_conversions(
        scenario, optimal_conversions, marginal_benefit, conversion_cost_today, bases
    )

    # Sensitivity notes
    sensitivity_notes = _build_sensitivity_notes(scenario, optimal_conversions, bases)

    # Summary points
    summary_points = _build_summary_points(scenario, optimal_conversions, marginal_benefit)

    # ACA impact analysis
    aca_impact = None
    aca_summary = None
    if aca_details:
        aca_impact = aca_details
        aca_summary = _build_aca_summary(scenario, aca_details, optimal_conversions)

    return ReasoningTrace(
        binding_constraint=binding_constraint,
        marginal_benefit_at_optimal=round(marginal_benefit, 2),
        cost_of_converting_more=cost_of_more,
        cost_and_benefit_of_conversions=cost_and_benefit,
        sensitivity_notes=sensitivity_notes,
        summary_points=summary_points,
        aca_impact=aca_impact,
        aca_summary=aca_summary,
    )


def _find_binding_constraint(
    scenario: ScenarioInput,
    conversions: list[float],
    bracket_fill: list[list[BracketFillResult]],
    bases: list[float] | None = None,
) -> str:
    """Determine what's limiting the optimal conversion amount.

    Looks at where each year's conversion stops: at a bracket edge, just under
    a Medicare surcharge (IRMAA) threshold, or partway into a bracket where
    converting more costs more than it saves. Reports the most common reason.
    """
    remaining = _traditional_left_after_conversions(scenario, conversions)
    if remaining < scenario.traditional_ira_balance * FULLY_CONVERTED_SHARE:
        last = max(t for t, c in enumerate(conversions) if c > 0)
        return f"Converts nearly all of the traditional balance by {scenario.timeline[last].year}"

    reasons = []
    for t, fills in enumerate(bracket_fill):
        if t >= len(conversions) or conversions[t] <= 0:
            continue
        filled = [f for f in fills if f.filled_by_conversion > 0]
        if not filled:
            continue
        top = filled[-1]
        # Conversions are rounded to $100, so one that fills a bracket can spill a
        # few dollars into the next. That still stops at the lower bracket's edge.
        spilled = len(filled) > 1 and top.filled_by_conversion < ROUNDING_RESOLUTION
        if spilled:
            top = filled[-2]
        rate = f"{top.bracket_rate:.0%}"
        base = bases[t] if bases else scenario.timeline[t].gross_income
        magi = year_tax(scenario, t).agi(base + conversions[t])
        if _just_under_irmaa_threshold(scenario, t, magi):
            reasons.append("Just under the Medicare surcharge (IRMAA) threshold")
        elif spilled or top.remaining_capacity < BRACKET_FULL_THRESHOLD:
            reasons.append(f"Top of {rate} bracket")
        else:
            reasons.append(f"Partway into {rate} bracket")

    if not reasons:
        return "Marginal cost exceeds marginal benefit of additional conversion"

    most_common = max(dict.fromkeys(reasons), key=reasons.count)
    years = reasons.count(most_common)
    label = most_common if years == 1 else f"{most_common} in {years} years"
    if most_common.startswith("Partway"):
        label += ": converting more costs more than it saves"
    return label


def _traditional_left_after_conversions(scenario: ScenarioInput, conversions: list[float]) -> float:
    """Traditional balance left right after the last conversion.

    Read from the same walk of the plan the optimizer values. Summing conversions
    is not enough: the balance grows between conversions, so they can add up to
    more than today's balance and still leave money behind.
    """
    last = max((t for t, c in enumerate(conversions) if c > 0), default=-1)
    if last < 0:
        return scenario.traditional_ira_balance
    year = walk(scenario, conversions).flows[last]
    return year.trad_start - year.rmd - year.conversion


def _just_under_irmaa_threshold(scenario: ScenarioInput, t: int, magi: float) -> bool:
    """Whether year t's income lands just below an IRMAA tier boundary it is exposed to."""
    if not scenario.people_at_least(MEDICARE_START_AGE, t + IRMAA_LOOKBACK_YEARS):
        return False
    key = "mfj_max" if scenario.filing_status == FilingStatus.MFJ else "single_max"
    scale = lookback_threshold_scale(scenario.inflation_rate)
    return any(
        0 <= tier[key] * scale - magi <= IRMAA_NEAR_THRESHOLD
        for tier in IRMAA_TIERS
        if tier[key] != float("inf")
    )


def _bracket_label(rate: float) -> str:
    return f"{rate:.0%}"


def _federal_slices(
    before: float, after: float, filing_status: FilingStatus
) -> list[tuple[float, float]]:
    """Split the taxable income between ``before`` and ``after`` by federal bracket:
    (bracket rate, dollars taxed in it), lowest bracket first."""
    slices = []
    for bracket in BRACKETS[filing_status]:
        amount = min(after, bracket["max"]) - max(before, bracket["min"])
        if amount > 0:
            slices.append((bracket["rate"], amount))
    return slices


def _cost_of_converting_more(
    scenario: ScenarioInput,
    conversions: list[float],
    bases: list[float] | None = None,
) -> dict:
    """What converting $1,000 more in the first conversion year would cost, bracket by bracket.

    The extra $1,000 often straddles a bracket edge, because schedules tend to stop
    near one. Its cost divided by $1,000 is then a blend of two brackets (17% between
    12% and 22%) that reads like a bracket and is not one. So the cost is split by the
    brackets that tax it, and no rate here is an average.
    """
    extra = EXTRA_CONVERSION
    t = next((i for i, c in enumerate(conversions) if c > 0), 0)
    entry = scenario.timeline[t]
    income = bases[t] if bases else entry.gross_income
    conversion = conversions[t] if t < len(conversions) else 0.0
    yr_state = resolve_state_for_year(entry.state, scenario.state)
    yt = year_tax(scenario, t)
    brackets = BRACKETS[scenario.filing_status]

    # Federal: the taxable income the extra adds, and the brackets it lands in
    before = yt.taxable_income(income + conversion)
    after = yt.taxable_income(income + conversion + extra)
    by_bracket = [
        {
            "bracket": _bracket_label(rate),
            "amount_taxed": round(amount),
            "tax": round(amount * rate),
        }
        for rate, amount in _federal_slices(before, after, scenario.filing_status)
    ]
    state_tax = round(
        state_tax_on_conversion(
            income + conversion,
            extra,
            yr_state,
            scenario.filing_status,
            scenario.custom_state_rate,
            yt,
        )
    )
    # The pieces are rounded to the dollar, so the total is their sum and they add up
    additional_tax = sum(piece["tax"] for piece in by_bracket) + state_tax

    out: dict = {
        "year": entry.year,
        "extra_conversion": extra,
        "additional_tax": additional_tax,
        "federal_tax_by_bracket": by_bracket,
    }
    if state_tax:
        out["state_tax"] = state_tax

    # Where the schedule's last converted dollar sits that year
    stop = next((b for b in brackets if b["min"] < before <= b["max"]), None)
    if stop is not None:
        out["schedule_stops_in_bracket"] = _bracket_label(stop["rate"])
        higher = [b for b in brackets if b["min"] >= stop["max"]]
        if higher:
            out["room_left_in_that_bracket"] = round(stop["max"] - before)
            out["next_bracket"] = _bracket_label(higher[0]["rate"])

    pieces = [f"${p['amount_taxed']:,} in the {p['bracket']} bracket" for p in by_bracket]
    text = f"Converting ${extra:,} more in {entry.year} would cost ${additional_tax:,} in additional tax"
    if pieces:
        text += ": " + " and ".join(pieces)
    if state_tax:
        text += f", plus ${state_tax:,} of state tax"
    text += "."
    added = round(after - before)
    if added < extra:
        text += (
            f" ${extra - added:,} of it falls under the standard deduction and is not taxed"
            " federally."
        )
    elif added > extra:
        out["taxable_income_added"] = added
        text += (
            f" It adds ${added:,} to taxable income, more than the ${extra:,} converted,"
            " because the higher income makes more Social Security taxable or shrinks a"
            " deduction."
        )
    out["explanation"] = text
    return out


def _cost_and_benefit_of_conversions(
    scenario: ScenarioInput,
    conversions: list[float],
    lifetime_savings: float,
    conversion_cost_today: float | None,
    bases: list[float] | None = None,
) -> dict:
    """What the conversions cost now and avoid later, in today's dollars.

    ``average_tax_rate`` is the average federal + state rate on the conversions.
    ``tax_paid`` is the tax, lost ACA subsidy and IRMAA the conversions cause,
    discounted to today, and ``future_tax_avoided`` is that plus the savings, so
    avoided minus paid is the headline savings.
    """
    total_tax_paid = 0.0
    for t in range(len(conversions)):
        income = bases[t] if bases else scenario.timeline[t].gross_income
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        total_tax_paid += total_conversion_cost(
            income,
            conversions[t],
            scenario.filing_status,
            state=yr_state,
            custom_state_rate=scenario.custom_state_rate,
            year=year_tax(scenario, t),
        )

    total_conversion = sum(conversions)
    avg_rate = total_tax_paid / total_conversion if total_conversion > 0 else 0.0
    paid_now = total_tax_paid if conversion_cost_today is None else conversion_cost_today

    return {
        "average_tax_rate": round(avg_rate, 4),
        "tax_paid": round(paid_now, 2),
        "future_tax_avoided": round(paid_now + lifetime_savings, 2),
        "dollars": "today's dollars (the schedule adds up each year's tax as paid)"
        if conversion_cost_today is not None
        else "each year's tax as paid",
    }


def _year_span(years: list[int]) -> str:
    return str(years[0]) if len(years) == 1 else f"{years[0]} to {years[-1]}"


def _who_pays_the_tax(scenario: ScenarioInput, conversions: list[float]) -> list[str]:
    """Where the money for the conversion tax comes from, by kind of year."""
    rules = plan_for(scenario).years
    converting = [t for t, c in enumerate(conversions) if c > 0]
    from_income = [rules[t].year for t in converting if rules[t].budget is None]
    from_accounts = [rules[t].year for t in converting if rules[t].budget is not None]
    notes = []
    if from_income:
        notes.append(
            f"Tax on the conversions in {_year_span(from_income)} is paid from that year's "
            "income, so the whole amount converted stays invested"
        )
    if from_accounts:
        notes.append(
            f"In {_year_span(from_accounts)} the accounts fund spending, so they also pay the "
            "tax on the conversions: withdrawals are larger in those years and spending "
            "stays the same"
        )
    return notes


def _build_sensitivity_notes(
    scenario: ScenarioInput,
    conversions: list[float],
    bases: list[float] | None = None,
) -> list[str]:
    """Generate notes about what assumptions the result is sensitive to."""
    notes = []

    if scenario.annual_growth_rate > HIGH_GROWTH_RATE:
        notes.append(
            "Result is sensitive to the assumed growth rate — a lower return reduces the benefit of conversion"
        )
    elif scenario.annual_growth_rate < LOW_GROWTH_RATE:
        notes.append(
            "Conservative growth assumption — higher returns would increase conversion benefit"
        )
    else:
        notes.append(
            f"Moderate growth assumption ({scenario.annual_growth_rate:.0%}) — result changes modestly with ±2% variation"
        )

    n_years = len(conversions)
    if n_years > 1:
        incomes = [y.gross_income for y in scenario.timeline]
        income_range = max(incomes) - min(incomes)
        if income_range > LARGE_INCOME_VARIATION:
            notes.append(
                "Large income variation across years creates significant conversion opportunities in low-income years"
            )

    years_in_plan = scenario.planning_horizon_age - scenario.age
    if years_in_plan >= LONG_RETIREMENT_YEARS:
        notes.append(
            "A long plan gives the traditional balance more years to grow, which raises later "
            "required withdrawals and the tax on them"
        )

    notes.extend(_who_pays_the_tax(scenario, conversions))

    if scenario.healthcare:
        notes.append(
            "ACA subsidy impact is included — the true cost of each conversion dollar "
            "accounts for both federal tax and any reduction in your marketplace premium subsidy"
        )

    # RMD impact note

    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    years_to_rmd = owner_rmd_start - scenario.age
    if years_to_rmd <= 0:
        notes.append(
            f"RMDs have already begun (age {owner_rmd_start}) — "
            f"converting now reduces the remaining balance subject to forced taxable withdrawals"
        )
    elif years_to_rmd <= 15:
        notes.append(
            f"RMDs begin at age {owner_rmd_start} ({years_to_rmd} years from now) — "
            f"converting before then reduces forced taxable withdrawals in retirement"
        )
    elif scenario.traditional_ira_balance >= LARGE_BALANCE_THRESHOLD:
        notes.append(
            f"With a large traditional IRA balance, future RMDs (starting at age {owner_rmd_start}) "
            f"could push into higher brackets — early conversion mitigates this"
        )

    # One note per state, so a move between states reads as two rates, not a blend
    by_state: dict[str, list[tuple[int, float]]] = {}
    for t in range(len(conversions)):
        if conversions[t] <= 0:
            continue
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        if not yr_state or yr_state == "none":
            continue
        income = bases[t] if bases else scenario.timeline[t].gross_income
        # State-only marginal = combined - federal
        yt = year_tax(scenario, t)
        total_rate = combined_marginal_rate(
            income,
            conversions[t],
            scenario.filing_status,
            state=yr_state,
            custom_state_rate=scenario.custom_state_rate,
            year=yt,
        )
        federal_rate = yt.federal_bracket(income + conversions[t])
        by_state.setdefault(yr_state, []).append(
            (scenario.timeline[t].year, total_rate - federal_rate)
        )
    for code, rows in by_state.items():
        years = [y for y, _ in rows]
        span = str(years[0]) if len(years) == 1 else f"{years[0]} to {years[-1]}"
        avg_state = sum(r for _, r in rows) / len(rows)
        name = state_name(code)
        if avg_state < MIN_STATE_RATE:
            note = f"{name} adds no state income tax to conversions ({span})"
        else:
            note = (
                f"{name} income tax adds about {avg_state:.1%} to conversions ({span}); "
                f"combined federal and state rates are used in optimization"
            )
        rule = retirement_rule(code)
        if rule:
            note += f". {rule['summary'].rstrip('.')}"
        notes.append(note)

    return notes


def _build_aca_summary(
    scenario: ScenarioInput,
    aca_details: list[AcaSubsidyDetail],
    conversions: list[float],
) -> dict:
    """Build a human-readable summary of the ACA subsidy impact."""
    total_subsidy_lost = sum(d.subsidy_lost for d in aca_details)
    # federal_tax_cost on each year holds federal + state tax on the conversion
    total_tax = sum(d.federal_tax_cost for d in aca_details)
    total_combined = sum(d.combined_cost for d in aca_details)
    # Only marketplace years are in aca_details, so the rate divides by their conversions
    marketplace_conversion = sum(
        d.magi_with_conversion - d.magi_without_conversion for d in aca_details
    )

    years_with_loss = [d for d in aca_details if d.subsidy_lost > 0]
    years_hitting_cliff = [d for d in aca_details if d.hits_cliff]

    summary: dict = {
        "total_subsidy_lost": round(total_subsidy_lost, 2),
        "tax_on_conversions_in_marketplace_years": round(total_tax, 2),
        "total_combined_cost": round(total_combined, 2),
        "effective_combined_rate": round(total_combined / marketplace_conversion, 4)
        if marketplace_conversion > 0
        else 0.0,
        "years_with_subsidy_loss": len(years_with_loss),
        "years_hitting_cliff": len(years_hitting_cliff),
    }

    # Plain-English explanation for the AI layer
    if aca_details and marketplace_conversion <= 0:
        years = [d.year for d in aca_details]
        span = str(years[0]) if len(years) == 1 else f"{years[0]} to {years[-1]}"
        cliff = find_subsidy_cliff_income(scenario.healthcare.household_size)
        highest = max(d.magi_without_conversion for d in aca_details)
        summary["explanation"] = (
            f"No conversions fall in your marketplace years ({span}). Without converting, "
            f"income in those years is up to ${highest:,.0f} (the subsidy ends at "
            f"${cliff:,.0f}), so converting then would cost more in tax and lost subsidy "
            f"than it saves."
        )
    elif total_subsidy_lost == 0:
        summary["explanation"] = (
            "The recommended conversions do not reduce your ACA marketplace subsidy. In each "
            "marketplace year your income either stays where the subsidy is unchanged or is "
            "already above 400% of the federal poverty level without converting."
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
            f"This subsidy loss is factored into the optimization, and the recommended "
            f"conversion amounts already balance tax savings against subsidy cost."
        )

    # Only name a worst year when subsidy is actually lost; otherwise it is just tax
    worst_year = max(years_with_loss, key=lambda d: d.combined_marginal_rate, default=None)
    if worst_year:
        summary["worst_year_note"] = (
            f"In {worst_year.year}, each dollar converted has a combined cost of "
            f"{worst_year.combined_marginal_rate:.0%} (tax + subsidy reduction)"
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
                year = scenario.timeline[t].year
                year_parts.append(f"${conversions[t]:,.0f} in {year}")
        what = "Convert " + ", ".join(year_parts) if year_parts else "No conversion recommended"

    # Why this amount
    low_income_years = [scenario.timeline[t].year for t in range(n_years) if conversions[t] > 0]
    if low_income_years:
        why = f"Fills lower tax brackets during {'low-income years' if n_years > 1 else 'current income level'} without pushing into expensive higher brackets"
    else:
        why = "Current income already fills brackets efficiently"

    # How much saved
    how_much = (
        f"Estimated ${abs(lifetime_savings):,.0f} in lifetime tax savings (in today's dollars)"
    )

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
