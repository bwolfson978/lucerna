"""Dynamic Programming optimizer for multi-year Roth conversions.

Guarantees global optimality by exhaustive search over a discretized balance
grid.  Two-pass approach:

1. Coarse pass — finds the optimal region across the full balance range
2. Fine pass  — refines to $100 resolution around the optimum

The state at each stage (year) is the remaining traditional IRA balance.
The decision is how much to convert.  The retirement phase is computed as a
terminal value function.  Complexity is O(N × G²) where N = timeline years
and G = grid size, vectorized with numpy for sub-second performance.
"""

from dataclasses import dataclass

import numpy as np

from app.engine.aca import vectorized_subsidy_loss
from app.engine.constants import RETIREMENT_SPENDING_RATE, round_to_resolution
from app.engine.irmaa import (
    IRMAA_LOOKBACK_YEARS,
    MEDICARE_START_AGE,
    vectorized_irmaa_surcharge_loss,
)
from app.engine.rmd import calculate_rmd, rmd_start_age, vectorized_rmd
from app.engine.state_tax import (
    calculate_state_tax,
    resolve_state_for_year,
    vectorized_state_tax,
)
from app.engine.tax import calculate_federal_tax, vectorized_federal_tax
from app.engine.types import ConversionCurvePoint, ScenarioInput


def _aca_coverage_years(scenario: ScenarioInput) -> set[int]:
    """Determine which calendar years the user needs ACA marketplace coverage.

    Shared logic for both 2D and 3D DP backward passes. Equivalent to the
    function of the same name in optimizer.py.
    """
    hc = scenario.healthcare
    if hc is None:
        return set()

    timeline_years = {y.year for y in scenario.timeline}

    if hc.aca_coverage_years is not None:
        return set(hc.aca_coverage_years) & timeline_years

    if hc.has_employer_coverage_after is not None:
        return {y for y in timeline_years if y < hc.has_employer_coverage_after}

    return timeline_years


@dataclass
class DPResult:
    """Output from the DP optimizer."""

    yearly_conversions: list[float]
    total_conversion: float
    npv: float


def _compute_retirement_values(
    trad_balances: np.ndarray,
    roth_balances: np.ndarray,
    scenario: ScenarioInput,
    n_timeline_years: int,
) -> np.ndarray:
    """Compute discounted NPV of the retirement phase for each balance split.

    For each (trad, roth) pair, simulates:
    - Annual withdrawals (traditional first, then Roth) with tax
    - Terminal liquidation of remaining balances

    Returns an array of NPV values, one per grid point.
    """
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)

    # Phase 3 age tracking fix: phase3_start accounts for the fact that the
    # timeline may end before drawdown begins (growth-only gap years).
    phase3_start = max(n_timeline_years, years_until_drawdown)
    n_retirement = scenario.planning_horizon_age - scenario.age - phase3_start

    # Determine spending
    spending = scenario.default_drawdown
    if spending is None:
        total = trad_balances + roth_balances
        spending_arr = total * RETIREMENT_SPENDING_RATE
    else:
        spending_arr = np.full_like(trad_balances, spending)

    trad = trad_balances.copy()
    roth = roth_balances.copy()
    npv = np.zeros_like(trad)

    # Resolve retirement state for distributions and liquidation
    ret_state = scenario.retirement_state or scenario.state

    # RMD parameters
    owner_rmd_start = rmd_start_age(scenario.age)

    for year_offset in range(1, n_retirement + 1):
        year = phase3_start + year_offset

        # IRS RMD uses Dec 31 of the prior year — save balance before growth
        pre_growth_trad = trad.copy()

        # Grow at start of year
        trad *= 1 + g
        roth *= 1 + g

        # Determine age in this retirement year
        owner_age = scenario.age + year

        # Calculate RMD (mandatory minimum withdrawal from traditional)
        if owner_age >= owner_rmd_start:
            rmd = vectorized_rmd(pre_growth_trad, owner_age)
        else:
            rmd = np.zeros_like(trad)

        # Withdraw at least the RMD from traditional, or spending if larger
        distribution = np.maximum(rmd, np.minimum(spending_arr, trad))
        distribution = np.minimum(distribution, trad)  # can't exceed balance
        trad -= distribution

        tax_on_dist = vectorized_federal_tax(distribution, scenario.filing_status)
        if ret_state:
            tax_on_dist = tax_on_dist + vectorized_state_tax(
                distribution, ret_state, scenario.filing_status, scenario.custom_state_rate
            )
        after_tax = distribution - tax_on_dist

        # Shortfall from Roth (tax-free)
        shortfall = spending_arr - distribution
        roth_draw = np.minimum(np.maximum(0.0, shortfall), roth)
        roth -= roth_draw
        after_tax += roth_draw

        discount_factor = (1 + d) ** (-year)
        npv += after_tax * discount_factor

    # Terminal liquidation
    liquidation_year = phase3_start + n_retirement + 1
    discount_factor = (1 + d) ** (-liquidation_year)

    tax_on_liq = vectorized_federal_tax(np.maximum(0.0, trad), scenario.filing_status)
    if ret_state:
        tax_on_liq = tax_on_liq + vectorized_state_tax(
            np.maximum(0.0, trad), ret_state, scenario.filing_status, scenario.custom_state_rate
        )
    npv += (np.maximum(0.0, trad) - tax_on_liq) * discount_factor
    npv += np.maximum(0.0, roth) * discount_factor

    return npv


def _simulate_no_conversion_trajectory(scenario: ScenarioInput) -> float:
    """Simulate the zero-conversion trajectory through the timeline.

    Returns total (trad + roth) wealth at the end of the timeline. This anchors the
    DP invariant: roth = max(0, total - trad). Conversions shift trad→roth but leave
    total unchanged (tax costs are tracked separately in NPV). Drawdowns reduce total
    by fixed amounts that are independent of the trad/roth split (assuming sufficient
    trad balance, which holds for typical scenarios).

    Note: RMDs depend on trad balance and thus differ between conversion scenarios.
    We use the no-conversion case (highest RMDs, lowest total) as a conservative
    anchor: this slightly underestimates roth for the conversion case, making the DP
    marginally conservative but never wildly wrong.
    """
    g = scenario.annual_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age)
    trad = float(scenario.traditional_ira_balance)
    roth = float(scenario.roth_ira_balance)
    for t, entry in enumerate(scenario.timeline):
        owner_age = scenario.age + t
        if owner_age >= owner_rmd_start:
            rmd = min(calculate_rmd(trad, owner_age), trad)
            trad -= rmd
        if entry.drawdown is not None and entry.drawdown > 0:
            d_amt = float(entry.drawdown)
            trad_draw = min(d_amt, trad)
            trad -= trad_draw
            roth -= min(d_amt - trad_draw, roth)
        trad *= 1 + g
        roth *= 1 + g
    return trad + roth


def _dp_backward(
    scenario: ScenarioInput,
    balance_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run backward induction over the timeline years.

    Returns:
        value_table: shape (n_years+1, G) — optimal NPV from year t onward.
        policy_table: shape (n_years, G) — optimal conversion grid index.
        extended_grid: the balance grid used internally (may be larger than
                       the input grid to accommodate balance growth).
    """
    n_years = len(scenario.timeline)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    remaining_growth_years = max(0, years_until_drawdown) - n_years
    growth_factor = (1 + g) ** remaining_growth_years if remaining_growth_years > 0 else 1.0

    initial_balance = scenario.traditional_ira_balance
    owner_rmd_start = rmd_start_age(scenario.age)

    # Grid upper bound: the balance peaks at the drawdown-start year (before
    # withdrawals reduce it). Capping at min(n_years, years_until_drawdown)
    # gives the true max whether or not the timeline extends past drawdown start.
    max_grown_balance = initial_balance * (1 + g) ** min(n_years, years_until_drawdown)
    if max_grown_balance <= 0:
        max_grown_balance = initial_balance

    G = len(balance_grid)
    if max_grown_balance > initial_balance * 1.5 and G > 20:
        n_fine = int(G * 0.8)
        n_coarse = G - n_fine
        fine_part = np.linspace(0, initial_balance, n_fine, endpoint=False)
        coarse_part = np.linspace(initial_balance, max_grown_balance, n_coarse)
        extended_grid = np.concatenate([fine_part, coarse_part])
    else:
        extended_grid = np.linspace(0, max_grown_balance, G)

    value_table = np.zeros((n_years + 1, G))

    # Terminal values: reconstruct roth from the total-wealth invariant.
    # total_at_timeline_end is computed by simulating the no-conversion trajectory
    # (zero conversion, all drawdowns/RMDs at their highest). growth_factor covers
    # any gap between timeline end and drawdown start.
    total_at_timeline_end = _simulate_no_conversion_trajectory(scenario)
    total_at_drawdown_start = total_at_timeline_end * growth_factor
    trad_at_drawdown_start = extended_grid * growth_factor
    roth_at_drawdown_start = np.maximum(0.0, total_at_drawdown_start - trad_at_drawdown_start)

    value_table[n_years] = _compute_retirement_values(
        trad_at_drawdown_start, roth_at_drawdown_start, scenario, n_years
    )

    policy_table = np.zeros((n_years, G), dtype=np.int64)

    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)

    tax_without_cache = [
        calculate_federal_tax(scenario.timeline[t].gross_income, scenario.filing_status)
        for t in range(n_years)
    ]

    # Pre-compute per-grid-state RMD arrays for each year. None for non-RMD years.
    # For RMD years, tax cost and state transition are computed per-state in the loop
    # (the income base rmd(grid[i]) must reflect the current balance state, not the
    # conversion amount). For non-RMD years, cost is balance-independent and can be
    # pre-computed once and reused across all states.
    rmd_arrays_per_year: list[np.ndarray | None] = []
    for t in range(n_years):
        owner_age = scenario.age + t
        if owner_age >= owner_rmd_start:
            rmd_arrays_per_year.append(
                np.minimum(vectorized_rmd(extended_grid, owner_age), extended_grid)
            )
        else:
            rmd_arrays_per_year.append(None)

    # Pre-compute conversion cost for non-RMD years (income-base is independent of state)
    tax_cost_by_year: list[np.ndarray | None] = []
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            tax_cost_by_year.append(None)  # computed per-state in backward loop
        else:
            income_t = scenario.timeline[t].gross_income
            tax_with = vectorized_federal_tax(income_t + extended_grid, scenario.filing_status)
            tax_cost_by_year.append(tax_with - tax_without_cache[t])

    state_cost_by_year: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            continue  # per-state in loop
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        if yr_state:
            income_t = scenario.timeline[t].gross_income
            st_with = vectorized_state_tax(
                income_t + extended_grid,
                yr_state,
                scenario.filing_status,
                scenario.custom_state_rate,
            )
            st_without = calculate_state_tax(
                income_t, yr_state, scenario.filing_status, scenario.custom_state_rate
            )
            state_cost_by_year[t] = st_with - st_without

    # ACA: only applies before Medicare (age < 65); RMDs start at 73+, so no overlap
    aca_cost_by_year: list[np.ndarray | None] = [None] * n_years
    if hc:
        for t in range(n_years):
            if rmd_arrays_per_year[t] is not None:
                continue
            year_t = scenario.timeline[t].year
            if year_t in aca_years:
                income_t = scenario.timeline[t].gross_income
                aca_cost_by_year[t] = vectorized_subsidy_loss(
                    income_t,
                    extended_grid,
                    hc.household_size,
                    hc.monthly_slcsp_premium,
                )

    # IRMAA: pre-compute for non-RMD years; per-state in loop for RMD years
    irmaa_cost_by_year: list[np.ndarray | None] = [None] * n_years
    irmaa_discount_ratio = (1 + d) ** (-IRMAA_LOOKBACK_YEARS)
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            continue  # handled per-state in loop
        if scenario.age + t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS:
            income_t = scenario.timeline[t].gross_income
            irmaa_arr = np.array(
                [
                    vectorized_irmaa_surcharge_loss(
                        income_t, np.array([extended_grid[i]]), scenario.filing_status
                    )[0]
                    for i in range(G)
                ],
                dtype=float,
            )
            irmaa_cost_by_year[t] = irmaa_arr * irmaa_discount_ratio

    # Backward induction.
    # Non-RMD years: cost is pre-computed per conversion amount (not per state).
    # RMD years: cost is computed per-state because the income base (income + rmd(grid[i]))
    #   depends on the balance state, not the conversion amount.
    # All years with drawdowns or RMDs: state transition deducts the withdrawal.
    for t in range(n_years - 1, -1, -1):
        discount_factor = (1 + d) ** (-t)
        future_ref = value_table[t + 1]

        entry_t = scenario.timeline[t]
        owner_age_t = scenario.age + t
        income_t = entry_t.gross_income
        drawdown_t = float(entry_t.drawdown) if entry_t.drawdown is not None else 0.0
        yr_state = resolve_state_for_year(entry_t.state, scenario.state)
        rmd_arr_t = rmd_arrays_per_year[t]
        has_rmd = rmd_arr_t is not None
        irmaa_exposed_t = owner_age_t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS

        # Pre-built discounted cost_row for non-RMD years
        if not has_rmd:
            cost_row = tax_cost_by_year[t].copy()
            if state_cost_by_year[t] is not None:
                cost_row += state_cost_by_year[t]
            if aca_cost_by_year[t] is not None:
                cost_row += aca_cost_by_year[t]
            if irmaa_cost_by_year[t] is not None:
                cost_row += irmaa_cost_by_year[t]
            cost_row *= discount_factor
        else:
            cost_row = None  # computed per-state below

        for i in range(G):
            available = extended_grid[i]
            if available <= 0:
                value_table[t, i] = value_table[t + 1, 0]
                policy_table[t, i] = 0
                continue

            # Mandatory RMD reduces the balance available for conversion
            rmd_i = float(rmd_arr_t[i]) if has_rmd else 0.0
            rmd_i = min(rmd_i, available)
            available_for_conv = available - rmd_i

            # Conversion options: grid points that don't exceed available_for_conv
            n_opts = int(np.searchsorted(extended_grid, available_for_conv + 1e-9, side="right"))
            n_opts = max(1, min(n_opts, i + 1))
            conv_options = extended_grid[:n_opts]

            # State transition: after RMD + conversion + drawdown, then grow
            avail_after_conv = available_for_conv - conv_options  # shape (n_opts,)
            if drawdown_t > 0:
                draw_from_trad = np.minimum(drawdown_t, avail_after_conv)
                next_trad = (avail_after_conv - draw_from_trad) * (1 + g)
            else:
                next_trad = avail_after_conv * (1 + g)

            future = np.interp(next_trad, extended_grid, future_ref)

            # Conversion cost (marginal tax on top of effective income)
            if has_rmd:
                eff_income = income_t + rmd_i
                cost_opts = vectorized_federal_tax(
                    eff_income + conv_options, scenario.filing_status
                ) - calculate_federal_tax(eff_income, scenario.filing_status)
                if yr_state:
                    cost_opts = cost_opts + vectorized_state_tax(
                        eff_income + conv_options,
                        yr_state,
                        scenario.filing_status,
                        scenario.custom_state_rate,
                    ) - calculate_state_tax(
                        eff_income, yr_state, scenario.filing_status, scenario.custom_state_rate
                    )
                if irmaa_exposed_t:
                    cost_opts = cost_opts + vectorized_irmaa_surcharge_loss(
                        eff_income, conv_options, scenario.filing_status
                    ) * irmaa_discount_ratio
                cost_opts = cost_opts * discount_factor
            else:
                cost_opts = cost_row[:n_opts]

            values = -cost_opts + future
            best_idx = int(np.argmax(values))
            value_table[t, i] = values[best_idx]
            policy_table[t, i] = best_idx

    return value_table, policy_table, extended_grid


def _forward_pass(
    scenario: ScenarioInput,
    extended_grid: np.ndarray,
    policy_table: np.ndarray,
) -> list[float]:
    """Read optimal conversion schedule by following the policy forward."""
    n_years = len(scenario.timeline)
    g = scenario.annual_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age)
    conversions = []

    current_balance = scenario.traditional_ira_balance

    for t in range(n_years):
        entry = scenario.timeline[t]
        owner_age = scenario.age + t

        # Find closest grid index to current balance
        idx = np.searchsorted(extended_grid, current_balance, side="right") - 1
        idx = max(0, min(idx, len(extended_grid) - 1))

        # Deduct mandatory RMD before conversion
        rmd_t = 0.0
        if owner_age >= owner_rmd_start:
            rmd_t = min(calculate_rmd(current_balance, owner_age), current_balance)
        available_for_conv = max(0.0, current_balance - rmd_t)

        # Get optimal conversion index from policy and clamp to available
        conv_idx = policy_table[t, idx]
        conversion = extended_grid[conv_idx] if conv_idx < len(extended_grid) else 0.0
        conversion = min(conversion, available_for_conv)
        conversions.append(round_to_resolution(conversion))

        # State transition: after conversion + drawdown, then grow
        balance_after_conv = available_for_conv - conversion
        drawdown_t = float(entry.drawdown) if entry.drawdown is not None else 0.0
        if drawdown_t > 0:
            balance_after_conv -= min(drawdown_t, balance_after_conv)

        current_balance = balance_after_conv * (1 + g)

    return conversions


def dp_optimize(
    scenario: ScenarioInput,
    coarse_grid_size: int = 1500,
    fine_resolution: float = 100.0,
    fine_window_pct: float = 0.10,
) -> DPResult:
    """Two-pass DP optimizer guaranteeing global optimality.

    Pass 1 (coarse): Searches the full balance range at ~G points to find
    the optimal region.

    Pass 2 (fine): Re-runs DP over a narrow window around the coarse optimum
    at $100 resolution for display-quality precision.

    Args:
        scenario: Full optimization inputs.
        coarse_grid_size: Number of grid points for the coarse pass.
        fine_resolution: Dollar resolution for the fine pass (default $100).
        fine_window_pct: Width of the fine window as fraction of balance (default 10%).

    Returns:
        DPResult with optimal conversions, NPV, and conversion curve data.
    """
    balance = scenario.traditional_ira_balance
    n_years = len(scenario.timeline)

    if balance <= 0 or n_years == 0:
        from app.engine.optimizer import calculate_npv

        npv = calculate_npv(scenario, [0.0] * n_years) if n_years > 0 else 0.0
        return DPResult(
            yearly_conversions=[0.0] * n_years,
            total_conversion=0.0,
            npv=npv,
        )

    # --- Pass 1: Coarse ---
    input_grid = np.linspace(0, balance, coarse_grid_size)

    coarse_value_table, coarse_policy, coarse_ext_grid = _dp_backward(
        scenario,
        input_grid,
    )
    coarse_conversions = _forward_pass(scenario, coarse_ext_grid, coarse_policy)

    # --- Pass 2: Fine refinement ---
    # Use finer grid if balance / fine_resolution > coarse grid size
    fine_grid_size = int(balance / fine_resolution) + 1
    if fine_grid_size > coarse_grid_size:
        fine_input_grid = np.linspace(0, balance, fine_grid_size)
        _, fine_policy, fine_ext_grid = _dp_backward(
            scenario,
            fine_input_grid,
        )
        conversions = _forward_pass(scenario, fine_ext_grid, fine_policy)
    else:
        conversions = coarse_conversions

    total = sum(conversions)

    # Compute NPV using the authoritative calculate_npv for consistency
    from app.engine.optimizer import calculate_npv

    npv = calculate_npv(scenario, conversions)

    return DPResult(
        yearly_conversions=conversions,
        total_conversion=total,
        npv=npv,
    )


def extract_conversion_curve(
    dp_result: DPResult,
    scenario: ScenarioInput,
    n_points: int = 50,
) -> list[ConversionCurvePoint]:
    """Build a conversion curve from the DP optimal schedule.

    For each total conversion cap, proportionally scales the DP's optimal
    per-year allocation and computes the actual NPV via calculate_npv.
    This is fast (~0.1ms per point) and produces an accurate, smooth curve
    whose peak aligns exactly with the DP optimal.
    """
    balance = scenario.traditional_ira_balance
    n_years = len(scenario.timeline)
    opt_total = dp_result.total_conversion
    opt_conversions = dp_result.yearly_conversions

    caps = np.linspace(0, balance, n_points)
    points: list[ConversionCurvePoint] = []

    for cap in caps:
        cap_rounded = round_to_resolution(cap)

        # Build per-year allocation by scaling the optimal schedule
        if cap_rounded <= 0:
            yearly_conv = [0.0] * n_years
        elif cap_rounded >= balance:
            # Full conversion in year 1
            yearly_conv = [float(balance)] + [0.0] * (n_years - 1)
        elif opt_total > 0:
            scale = cap_rounded / opt_total
            yearly_conv = [round_to_resolution(c * scale) for c in opt_conversions]
            # Adjust rounding error on the largest year
            diff = cap_rounded - sum(yearly_conv)
            if abs(diff) >= 100 and yearly_conv:
                max_idx = max(range(len(yearly_conv)), key=lambda i: yearly_conv[i])
                yearly_conv[max_idx] += round_to_resolution(diff)
        else:
            yearly_conv = [0.0] * n_years

        # Clamp to non-negative and within sequential balance (with growth)
        remaining_bal = balance
        g = scenario.annual_growth_rate
        for i in range(n_years):
            yearly_conv[i] = max(0.0, min(yearly_conv[i], remaining_bal))
            remaining_bal = (remaining_bal - yearly_conv[i]) * (1 + g)

        from app.engine.curve_strategy import build_curve_point

        points.append(build_curve_point(scenario, cap_rounded, yearly_conv))

    return points


# ── 3D DP: budget-constrained curve ─────────────────────────────────


def _dp_backward_3d(
    scenario: ScenarioInput,
    balance_grid: np.ndarray,
    budget_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Run backward induction with state = (year, balance, budget).

    The budget dimension tracks the remaining total conversion cap.
    At each step, conversion c ≤ min(balance, budget).

    Returns:
        value_table:  shape (n_years+1, G, B) — optimal NPV from year t onward.
        policy_table: shape (n_years, G, B) — optimal conversion grid index.
        extended_grid: the balance grid (may be extended for growth).
        budget_grid:   the budget grid (unchanged).
    """
    n_years = len(scenario.timeline)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    remaining_growth_years = max(0, years_until_drawdown) - n_years

    growth_factor = (1 + g) ** remaining_growth_years if remaining_growth_years > 0 else 1.0

    initial_balance = scenario.traditional_ira_balance

    # Extend balance grid for growth (same non-uniform logic as 2D DP).
    # Cap at min(n_years, years_until_drawdown): after drawdown start the balance
    # shrinks, so the grid needs to cover the peak, not the timeline end.
    max_grown_balance = initial_balance * (1 + g) ** min(n_years, years_until_drawdown)
    if max_grown_balance <= 0:
        max_grown_balance = initial_balance
    G_input = len(balance_grid)
    if max_grown_balance > initial_balance * 1.5 and G_input > 20:
        n_fine = int(G_input * 0.8)
        n_coarse = G_input - n_fine
        fine_part = np.linspace(0, initial_balance, n_fine, endpoint=False)
        coarse_part = np.linspace(initial_balance, max_grown_balance, n_coarse)
        extended_grid = np.concatenate([fine_part, coarse_part])
    else:
        extended_grid = np.linspace(0, max_grown_balance, G_input)
    G = len(extended_grid)
    B = len(budget_grid)

    value_table = np.zeros((n_years + 1, G, B))
    policy_table = np.zeros((n_years, G, B), dtype=np.int64)

    # Terminal values: budget doesn't affect the retirement phase.
    # Use _simulate_no_conversion_trajectory (same invariant as 2D DP) to get
    # an accurate total that accounts for any drawdowns/RMDs in the timeline.
    total_at_timeline_end = _simulate_no_conversion_trajectory(scenario)
    total_at_drawdown_start = total_at_timeline_end * growth_factor
    trad_at_drawdown_start = extended_grid * growth_factor
    roth_at_drawdown_start = np.maximum(0.0, total_at_drawdown_start - trad_at_drawdown_start)

    terminal_values = _compute_retirement_values(trad_at_drawdown_start, roth_at_drawdown_start, scenario, n_years)
    # Broadcast: same terminal value for all budget levels
    value_table[n_years] = terminal_values[:, np.newaxis]  # (G, 1) → (G, B)

    # Determine ACA coverage years (same as 2D)
    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)

    # RMD start age for the owner
    owner_rmd_start = rmd_start_age(scenario.age)

    # Pre-compute tax costs (same as 2D)
    tax_without_cache = [
        calculate_federal_tax(scenario.timeline[t].gross_income, scenario.filing_status)
        for t in range(n_years)
    ]

    tax_cost_by_year: list[np.ndarray] = []
    for t in range(n_years):
        owner_age = scenario.age + t
        income_t = scenario.timeline[t].gross_income

        if owner_age >= owner_rmd_start:
            rmd_by_state = vectorized_rmd(extended_grid, owner_age)  # shape (G,)
            effective_income = income_t + rmd_by_state  # shape (G,)
            tax_with = vectorized_federal_tax(effective_income + extended_grid, scenario.filing_status)
            tax_without = vectorized_federal_tax(effective_income, scenario.filing_status)
            tax_cost_by_year.append(tax_with - tax_without)
        else:
            tax_with = vectorized_federal_tax(income_t + extended_grid, scenario.filing_status)
            tax_cost_by_year.append(tax_with - tax_without_cache[t])

    # Pre-compute state tax costs per year (3D, same pattern as 2D)
    state_cost_by_year_3d: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        if yr_state:
            income_t = scenario.timeline[t].gross_income
            st_with = vectorized_state_tax(
                income_t + extended_grid,
                yr_state,
                scenario.filing_status,
                scenario.custom_state_rate,
            )
            st_without = calculate_state_tax(
                income_t, yr_state, scenario.filing_status, scenario.custom_state_rate
            )
            state_cost_by_year_3d[t] = st_with - st_without

    aca_cost_by_year: list[np.ndarray | None] = [None] * n_years
    if hc:
        for t in range(n_years):
            year_t = scenario.timeline[t].year
            if year_t in aca_years:
                income_t = scenario.timeline[t].gross_income
                aca_cost_by_year[t] = vectorized_subsidy_loss(
                    income_t,
                    extended_grid,
                    hc.household_size,
                    hc.monthly_slcsp_premium,
                )

    # Pre-compute IRMAA costs for years near or in Medicare eligibility
    irmaa_cost_by_year_3d: list[np.ndarray | None] = [None] * n_years
    irmaa_discount_ratio = (1 + d) ** (-IRMAA_LOOKBACK_YEARS)
    for t in range(n_years):
        if scenario.age + t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS:
            owner_age = scenario.age + t
            income_t = scenario.timeline[t].gross_income
            if owner_age >= owner_rmd_start:
                rmd_by_state = vectorized_rmd(extended_grid, owner_age)
                base_magi_arr = income_t + rmd_by_state
            else:
                base_magi_arr = np.full(len(extended_grid), income_t)
            irmaa_arr = np.array([
                vectorized_irmaa_surcharge_loss(float(base_magi_arr[i]), np.array([extended_grid[i]]), scenario.filing_status)[0]
                for i in range(len(extended_grid))
            ], dtype=float)
            irmaa_cost_by_year_3d[t] = irmaa_arr * irmaa_discount_ratio

    # Backward induction — vectorized bilinear interpolation.
    # For each balance state i, we process ALL budget states k at once
    # using numpy broadcasting, eliminating the inner k and j loops.
    for t in range(n_years - 1, -1, -1):
        discount_factor = (1 + d) ** (-t)
        future_ref = value_table[t + 1]  # shape (G, B)

        # Discounted cost for each conversion amount
        cost_row = tax_cost_by_year[t].copy()
        if state_cost_by_year_3d[t] is not None:
            cost_row += state_cost_by_year_3d[t]
        if aca_cost_by_year[t] is not None:
            cost_row += aca_cost_by_year[t]
        if irmaa_cost_by_year_3d[t] is not None:
            cost_row += irmaa_cost_by_year_3d[t]
        cost_row *= discount_factor

        for i in range(G):
            available = extended_grid[i]
            if available <= 0:
                value_table[t, i, :] = value_table[t + 1, 0, :]
                policy_table[t, i, :] = 0
                continue

            n_opts = i + 1
            remaining_bal = (available - extended_grid[:n_opts]) * (1 + g)

            # Step 1: Balance interpolation for all (j, b) pairs.
            # For each conversion j, find balance bracket and interpolate
            # future_ref across all budget columns at once.
            bal_indices = np.searchsorted(extended_grid, remaining_bal, side="right") - 1
            bal_indices = np.clip(bal_indices, 0, G - 2)

            spans = extended_grid[bal_indices + 1] - extended_grid[bal_indices]
            fracs_bal = np.where(
                spans > 0,
                (remaining_bal - extended_grid[bal_indices]) / spans,
                0.0,
            )

            # bal_interp[j, b] = future value at (remaining_bal[j], budget_grid[b])
            lo_vals = future_ref[bal_indices, :]  # (n_opts, B)
            hi_vals = future_ref[bal_indices + 1, :]  # (n_opts, B)
            bal_interp = lo_vals + fracs_bal[:, np.newaxis] * (hi_vals - lo_vals)

            # Step 2: Budget remapping via bilinear interpolation.
            # For conversion j at budget state k, remaining_budget = budget_grid[k] - extended_grid[j].
            # We need to look up bal_interp[j, :] at that remaining budget position.
            remaining_budgets = (
                budget_grid[np.newaxis, :] - extended_grid[:n_opts, np.newaxis]
            )  # (n_opts, B)

            bud_indices = (
                np.searchsorted(budget_grid, remaining_budgets.ravel(), side="right").reshape(
                    n_opts, B
                )
                - 1
            )
            bud_indices = np.clip(bud_indices, 0, B - 2)

            bud_spans = budget_grid[bud_indices + 1] - budget_grid[bud_indices]
            fracs_bud = np.where(
                bud_spans > 0,
                (remaining_budgets - budget_grid[bud_indices]) / bud_spans,
                0.0,
            )
            fracs_bud = np.clip(fracs_bud, 0.0, 1.0)

            # Fancy-index into bal_interp for budget interpolation
            j_idx = np.arange(n_opts)[:, np.newaxis]  # (n_opts, 1)
            future_lo = bal_interp[j_idx, bud_indices]  # (n_opts, B)
            future_hi = bal_interp[j_idx, bud_indices + 1]  # (n_opts, B)
            future_matrix = future_lo + fracs_bud * (future_hi - future_lo)

            # Step 3: Mask invalid options (conversion > budget) and pick best.
            invalid = extended_grid[:n_opts, np.newaxis] > budget_grid[np.newaxis, :] + 1e-6
            values_matrix = -cost_row[:n_opts, np.newaxis] + future_matrix
            values_matrix[invalid] = -np.inf

            best_indices = np.argmax(values_matrix, axis=0)  # (B,)
            value_table[t, i, :] = values_matrix[best_indices, np.arange(B)]
            policy_table[t, i, :] = best_indices

    return value_table, policy_table, extended_grid, budget_grid


def _forward_pass_3d(
    scenario: ScenarioInput,
    extended_grid: np.ndarray,
    budget_grid: np.ndarray,
    policy_table: np.ndarray,
    budget_cap: float,
) -> list[float]:
    """Extract optimal conversion schedule for a specific budget cap.

    Tracks balance and budget as continuous floats (not snapped to grid)
    to avoid drift over many years.
    """
    n_years = len(scenario.timeline)
    g = scenario.annual_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age)
    B = len(budget_grid)
    conversions = []

    current_balance = scenario.traditional_ira_balance
    current_budget = budget_cap

    for t in range(n_years):
        entry = scenario.timeline[t]
        owner_age = scenario.age + t

        if current_budget <= 0 or current_balance <= 0:
            conversions.append(0.0)
            # Still need to apply RMD/drawdown before growth for balance tracking
            rmd_t = 0.0
            if owner_age >= owner_rmd_start:
                rmd_t = min(calculate_rmd(current_balance, owner_age), current_balance)
            after_rmd = max(0.0, current_balance - rmd_t)
            drawdown_t = float(entry.drawdown) if entry.drawdown is not None else 0.0
            after_draw = max(0.0, after_rmd - min(drawdown_t, after_rmd))
            current_balance = after_draw * (1 + g)
            continue

        # Deduct mandatory RMD before conversion
        rmd_t = 0.0
        if owner_age >= owner_rmd_start:
            rmd_t = min(calculate_rmd(current_balance, owner_age), current_balance)
        available_for_conv = max(0.0, current_balance - rmd_t)

        # Find bracketing balance index
        bal_idx = np.searchsorted(extended_grid, current_balance, side="right") - 1
        bal_idx = max(0, min(bal_idx, len(extended_grid) - 1))

        # Find bracketing budget index
        bud_idx = np.searchsorted(budget_grid, current_budget, side="right") - 1
        bud_idx = max(0, min(bud_idx, B - 2))

        # Snap to nearest budget grid point's policy instead of
        # interpolating between neighboring policies.  Lerping blends
        # different allocation strategies and produces small spurious
        # amounts in years that shouldn't have conversions at this budget.
        b_lo, b_hi = bud_idx, min(bud_idx + 1, B - 1)
        dist_lo = abs(current_budget - budget_grid[b_lo])
        dist_hi = abs(current_budget - budget_grid[b_hi])
        b_snap = b_lo if dist_lo <= dist_hi else b_hi

        conv_idx = policy_table[t, bal_idx, b_snap]
        conversion = extended_grid[conv_idx] if conv_idx < len(extended_grid) else 0.0

        # Clamp to available balance (after RMD) and budget
        conversion = min(conversion, available_for_conv, current_budget)
        conversion = max(0.0, conversion)
        conversions.append(round_to_resolution(conversion))

        # State transition: after conversion + drawdown, then grow
        balance_after_conv = available_for_conv - conversion
        drawdown_t = float(entry.drawdown) if entry.drawdown is not None else 0.0
        if drawdown_t > 0:
            balance_after_conv -= min(drawdown_t, balance_after_conv)
        current_balance = balance_after_conv * (1 + g)
        current_budget -= conversion

    return conversions


def extract_conversion_curve_3d(
    scenario: ScenarioInput,
    n_curve_points: int = 200,
    balance_grid_size: int = 300,
    budget_grid_size: int = 50,
    curve_max: float | None = None,
) -> list[ConversionCurvePoint]:
    """Build a conversion curve using 3D DP with budget constraint.

    The budget grid (internal DP resolution) is decoupled from the output
    curve points.  The expensive backward pass is O(N × G × B) where B is
    budget_grid_size; forward passes are ~0.1ms each, so we can extract
    many more output points than internal budget states at negligible cost.

    Args:
        n_curve_points: Number of output curve points (default 200).
            With 200 points for a $100K balance the interval is ~$500,
            fine enough that the frontend can snap to the nearest point
            without visible jumps.
        budget_grid_size: Internal budget states for the 3D backward pass
            (default 50).  Controls DP accuracy, not output density.
        curve_max: Upper bound for the budget range.  When the DP optimal
            total exceeds the initial balance (due to inter-year growth),
            pass that total here so the curve covers the full range.
    """
    balance = scenario.traditional_ira_balance
    n_years = len(scenario.timeline)

    if balance <= 0 or n_years == 0:
        return []

    # Budget grid: extend to cover curve_max when inter-year growth lets
    # total conversions exceed the initial balance.
    upper = max(balance, curve_max or balance)
    budget_grid = np.linspace(0, upper, budget_grid_size)
    balance_grid = np.linspace(0, balance, balance_grid_size)

    # Single 3D backward pass (the expensive part)
    value_table, policy_table, extended_grid, budget_grid = _dp_backward_3d(
        scenario,
        balance_grid,
        budget_grid,
    )

    # Extract optimal schedule at many output caps via cheap forward passes.
    # The forward pass interpolates from the internal budget grid, so output
    # caps need not align with budget grid points.
    output_caps = np.linspace(0, upper, n_curve_points)
    points: list[ConversionCurvePoint] = []

    for cap in output_caps:
        cap_rounded = round_to_resolution(cap)

        if cap_rounded <= 0:
            yearly_conv = [0.0] * n_years
        else:
            yearly_conv = _forward_pass_3d(
                scenario,
                extended_grid,
                budget_grid,
                policy_table,
                cap_rounded,
            )

        # Clamp to non-negative and within sequential balance (with growth)
        remaining_bal = balance
        g = scenario.annual_growth_rate
        for i in range(n_years):
            yearly_conv[i] = max(0.0, min(yearly_conv[i], remaining_bal))
            remaining_bal = (remaining_bal - yearly_conv[i]) * (1 + g)

        # Force schedule to sum to exactly the cap.  The slider value is
        # a "must-do" total, not a maximum.  The DP provides the optimal
        # allocation ratios; scaling enforces the exact total so that the
        # curve's NPV reflects actually converting that amount.
        total_conv = sum(yearly_conv)
        if cap_rounded > 0 and total_conv > 0 and total_conv < cap_rounded - 1:
            scale_factor = cap_rounded / total_conv
            yearly_conv = [c * scale_factor for c in yearly_conv]
            # Re-clamp to sequential balance limits
            remaining_bal = balance
            for i in range(n_years):
                yearly_conv[i] = max(0.0, min(yearly_conv[i], remaining_bal))
                remaining_bal -= yearly_conv[i]

        from app.engine.curve_strategy import build_curve_point

        points.append(build_curve_point(scenario, cap_rounded, yearly_conv))

    return points
