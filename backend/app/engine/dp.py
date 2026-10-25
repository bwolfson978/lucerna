"""Dynamic Programming optimizer for multi-year Roth conversions.

── Algorithm overview ───────────────────────────────────────────────────────

2D backward-induction DP with state (trad_balance, roth_balance).

At each year t, for each (trad_i, roth_j) state, the DP evaluates every
reachable conversion amount and selects the one that maximises total lifetime
NPV.  Bellman's optimality principle guarantees a globally optimal solution
over the discretised state space — no heuristic, no local optima, no
dependence on a starting point.

── Optimality guarantee ─────────────────────────────────────────────────────

The result is globally optimal over the set of allocations where each year's
conversion falls on the trad grid.  In the important range [0, initial_balance]
the fine part of the grid has ~G_T × 0.8 points, giving a spacing of roughly:

    initial_balance / (0_T × 0.8)   ≈ $8.75k for a $1.4M balance at G_T=200

The worst-case per-year error relative to the continuous optimum is half a
grid step (~$4.4k).  Empirically the NPV gap between the DP result and the
true optimum (verified against an exhaustive bracket-fill curve scan) is
~$3–5k for a $1.4M scenario — less than 1% of estimated lifetime savings.

The roth grid (G_R=150, ~$44k spacing) adds a smaller error: the forward pass
snaps the running roth balance to within ~$22k, which propagates to roughly
$1–2k NPV error because the terminal value function is smooth in roth.

G_T and G_R are tunable knobs.  Approximate performance for a 21-year timeline:

    G_T=200, G_R=150  →  ~4s,  ~$3–5k NPV gap   (default)
    G_T=400, G_R=200  →  ~15s, ~$1k NPV gap
    G_T=700, G_R=250  →  ~40s, ~$300 NPV gap

── Why 2D state is necessary ────────────────────────────────────────────────

The earlier 1D DP (state = trad_balance only) estimated the roth balance at
end-of-timeline as:

    roth ≈ max(0, total_no_conv − trad)

where total_no_conv came from _simulate_no_conversion_trajectory.  This
approximation assumes conversions shift trad→roth without changing the total
(trad+roth) wealth.  That holds for simple timelines, but breaks badly when
RMD years fall inside the planning window.

The failure mode: the no-conversion trajectory takes large RMDs on a high trad
balance (e.g. $2.75M at age 73 for Margaret), which drains total_no_conv.  The
conversion trajectory, by contrast, enters the RMD window with a much smaller
trad balance, so its RMDs are tiny.  The result is that total_no_conv
underestimates actual roth for high-conversion states by ~$1.56M for Margaret
(21-year timeline, $1.4M balance).  The 1D DP therefore undervalued the
fully-converted state and stopped at $892k ($280k savings) when the true
optimum delivers $316k.

The 2D state solves this exactly: roth is tracked as a first-class state
variable and terminal values are computed from actual (trad, roth) pairs via
_compute_retirement_values_2d, with no approximation of the roth trajectory.

── Performance hot-path notes ───────────────────────────────────────────────

The outer Python loop is over trad states (G_T iterations per year).  The
inner numpy operations vectorise over roth states × conversion options.
Two key optimisations in _dp_backward_2d:

1. For years with drawdown_t == 0, roth interpolation indices are precomputed
   once for the full trad grid at the top of the year loop.  Each trad state
   then takes a zero-copy slice rather than recomputing ~9 numpy calls.

2. np.take_along_axis replaces 2D fancy indexing for the row-wise gather of
   future values at roth bracket bounds.

The defence-in-depth curve comparison in optimizer.optimize() remains as a
post-DP check: it evaluates calculate_npv at 200 bracket-fill allocations and
promotes the best one if it strictly beats the DP.  This bridges the ~$3k
precision gap that comes from the coarse trad grid.
"""

from dataclasses import dataclass

import numpy as np

from app.engine.aca import aca_coverage_years, vectorized_subsidy_loss
from app.engine.constants import round_to_resolution
from app.engine.irmaa import (
    IRMAA_LOOKBACK_YEARS,
    MEDICARE_START_AGE,
    vectorized_irmaa_surcharge_loss,
)
from app.engine.retirement import (
    account_spending,
    conversion_magi,
    draw_beyond_rmd,
    post_timeline_start,
    vectorized_terminal_value,
    vectorized_withdrawal_tax,
)
from app.engine.rmd import calculate_rmd, rmd_start_age, vectorized_rmd
from app.engine.state_tax import (
    resolve_state_for_year,
)
from app.engine.types import ConversionCurvePoint, ScenarioInput
from app.engine.year_tax import YearTax, year_taxes


def _aca_coverage_years(scenario: ScenarioInput) -> set[int]:
    """Calendar years the household needs ACA marketplace coverage."""
    return aca_coverage_years(scenario)


def _irmaa_loss(yt: YearTax, base, added):
    """IRMAA surcharge loss on MAGI that counts only the taxable part of Social Security."""
    agi_base = yt.agi(base)
    return vectorized_irmaa_surcharge_loss(
        agi_base, yt.agi(base + added) - agi_base, yt.filing_status, yt.irmaa_scale
    )


def _surcharges_with_spending(
    scenario: ScenarioInput,
    yt: YearTax,
    is_aca_year: bool,
    irmaa_exposed: bool,
    income_with_rmd: float,
    available_for_conv: float,
    need: float,
    conv_options: np.ndarray,
    irmaa_discount_ratio: float,
) -> np.ndarray:
    """Lost ACA subsidy and IRMAA per conversion option in a year with a spending draw.

    The traditional withdrawal for spending counts toward income, so these
    depend on the balance state and can't use the precomputed rows.
    """
    base, added = conversion_magi(income_with_rmd, available_for_conv, need, conv_options)
    base = float(base)
    cost = np.zeros_like(conv_options, dtype=float)
    hc = scenario.healthcare
    if is_aca_year and hc is not None:
        cost += vectorized_subsidy_loss(base, added, hc.household_size, hc.monthly_slcsp_premium)
    if irmaa_exposed:
        cost += _irmaa_loss(yt, base, added) * irmaa_discount_ratio
    return cost


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
    - Leftover traditional balance at the final year's marginal rate (``terminal_value``)

    Returns an array of NPV values, one per grid point.
    """
    g = scenario.real_growth_rate
    d = scenario.real_discount_rate

    # phase3_start accounts for the fact that the timeline may end before
    # drawdown begins (growth-only gap years). Same rules as calculate_npv.
    phase3_start = post_timeline_start(scenario)
    last_year = scenario.planning_horizon_age - scenario.age

    spending_arr = account_spending(scenario, trad_balances + roth_balances)

    trad = trad_balances.copy()
    roth = roth_balances.copy()
    npv = np.zeros_like(trad)

    # RMD parameters
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)

    for year in range(phase3_start, last_year + 1):
        owner_age = scenario.age + year

        # RMD on the start-of-year balance (IRS uses Dec 31 of the prior year)
        if owner_age >= owner_rmd_start:
            rmd = vectorized_rmd(trad, owner_age)
        else:
            rmd = np.zeros_like(trad)

        # Withdraw at least the RMD from traditional, or spending if larger
        distribution = np.maximum(rmd, np.minimum(spending_arr, trad))
        distribution = np.minimum(distribution, trad)  # can't exceed balance
        trad -= distribution

        after_tax = distribution - vectorized_withdrawal_tax(scenario, distribution, year)

        # Shortfall from Roth (tax-free)
        shortfall = spending_arr - distribution
        roth_draw = np.minimum(np.maximum(0.0, shortfall), roth)
        roth -= roth_draw
        after_tax += roth_draw

        discount_factor = (1 + d) ** (-year)
        npv += after_tax * discount_factor

        # Grow at end of year
        trad *= 1 + g
        roth *= 1 + g

    # Leftover balances: traditional at the final year's marginal rate, Roth tax-free
    npv += vectorized_terminal_value(scenario, trad, roth, last_year + 1)

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
    g = scenario.real_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    trad = float(scenario.traditional_ira_balance)
    roth = float(scenario.roth_ira_balance)
    for t, entry in enumerate(scenario.timeline):
        owner_age = scenario.age + t
        rmd = 0.0
        if owner_age >= owner_rmd_start:
            rmd = min(calculate_rmd(trad, owner_age), trad)
            trad -= rmd
        d_amt = draw_beyond_rmd(entry.drawdown, rmd)
        if d_amt > 0:
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
    g = scenario.real_growth_rate
    d = scenario.real_discount_rate
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    remaining_growth_years = max(0, years_until_drawdown) - n_years
    growth_factor = (1 + g) ** remaining_growth_years if remaining_growth_years > 0 else 1.0

    initial_balance = scenario.traditional_ira_balance
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)

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

    taxes = year_taxes(scenario)
    tax_without_cache = [
        taxes[t].federal(scenario.timeline[t].gross_income) for t in range(n_years)
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
            tax_with = taxes[t].federal(income_t + extended_grid)
            tax_cost_by_year.append(tax_with - tax_without_cache[t])

    state_cost_by_year: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            continue  # per-state in loop
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        if yr_state:
            income_t = scenario.timeline[t].gross_income
            st_with = taxes[t].state_tax(income_t + extended_grid)
            st_without = taxes[t].state_tax(income_t)
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
                    _irmaa_loss(taxes[t], income_t, np.array([extended_grid[i]]))[0]
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
        yt_t = taxes[t]
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
                draw_from_trad = np.minimum(max(0.0, drawdown_t - rmd_i), avail_after_conv)
                next_trad = (avail_after_conv - draw_from_trad) * (1 + g)
            else:
                next_trad = avail_after_conv * (1 + g)

            future = np.interp(next_trad, extended_grid, future_ref)

            # Conversion cost (marginal tax on top of effective income)
            if has_rmd:
                eff_income = income_t + rmd_i
                cost_opts = yt_t.total(eff_income + conv_options) - yt_t.total(eff_income)
                if irmaa_exposed_t:
                    cost_opts = (
                        cost_opts
                        + _irmaa_loss(yt_t, eff_income, conv_options) * irmaa_discount_ratio
                    )
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
    g = scenario.real_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
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
        drawdown_t = draw_beyond_rmd(entry.drawdown, rmd_t)
        if drawdown_t > 0:
            balance_after_conv -= min(drawdown_t, balance_after_conv)

        current_balance = balance_after_conv * (1 + g)

    return conversions


# ── 2D DP: exact (trad, roth) state tracking ────────────────────────────────


def _withdrawal_value(
    scenario: ScenarioInput,
    income: float,
    rmd: float,
    conv_options: np.ndarray,
    draw_from_trad: np.ndarray | None,
    need: float,
    yt: YearTax,
) -> np.ndarray:
    """After-tax value of a year's RMD and spending draws, per conversion option.

    Mirrors calculate_npv: the RMD is taxed on top of income, the traditional
    draw on top of income + RMD + conversion, and the Roth draw is tax-free.
    """
    tax = yt.total

    value = np.zeros_like(conv_options, dtype=float)
    if rmd > 0:
        base = np.array([income, income + rmd])
        t_lo, t_hi = tax(base)
        value += rmd - (t_hi - t_lo)
    if need > 0 and draw_from_trad is not None:
        base = income + rmd + conv_options
        value += draw_from_trad - (tax(base + draw_from_trad) - tax(base))
        value += need - draw_from_trad  # Roth covers the rest, tax-free
    return value


def _compute_retirement_values_2d(
    trad_2d: np.ndarray,
    roth_2d: np.ndarray,
    scenario: ScenarioInput,
    n_timeline_years: int,
) -> np.ndarray:
    """Compute retirement NPV for a 2D grid of (trad, roth) terminal states.

    Flattens the (G_T, G_R) input arrays, delegates to the vectorized 1D
    ``_compute_retirement_values``, and reshapes the result back.
    """
    shape = trad_2d.shape
    flat_trad = np.ascontiguousarray(trad_2d).ravel()
    flat_roth = np.ascontiguousarray(np.broadcast_to(roth_2d, shape)).ravel()
    result = _compute_retirement_values(flat_trad, flat_roth, scenario, n_timeline_years)
    return result.reshape(shape)


def _dp_backward_2d(
    scenario: ScenarioInput,
    trad_grid: np.ndarray,
    roth_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """2D backward induction: state = (trad_balance, roth_balance).

    Tracks Roth balance explicitly so terminal values are exact for every
    (trad, roth) pair — no no-conversion-trajectory approximation.

    The roth grid must be uniform to enable O(1) index arithmetic in the
    hot inner loop (avoiding per-element searchsorted).

    Returns:
        value_table:  (n_years+1, G_T, G_R).
        policy_table: (n_years,   G_T, G_R) — optimal conversion grid index.
        extended_trad: (G_T,) non-uniform trad grid (extended for growth).
        roth_grid: (G_R,) uniform roth grid (unchanged from input).
    """
    n_years = len(scenario.timeline)
    g = scenario.real_growth_rate
    d = scenario.real_discount_rate

    initial_balance = scenario.traditional_ira_balance
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    remaining_growth_years = max(0, years_until_drawdown) - n_years
    growth_factor = (1 + g) ** remaining_growth_years if remaining_growth_years > 0 else 1.0

    # Extend trad grid for balance growth (same non-uniform logic as _dp_backward)
    max_grown_balance = initial_balance * (1 + g) ** min(n_years, years_until_drawdown)
    if max_grown_balance <= 0:
        max_grown_balance = initial_balance
    G_T_input = len(trad_grid)
    if max_grown_balance > initial_balance * 1.5 and G_T_input > 20:
        n_fine = int(G_T_input * 0.8)
        n_coarse = G_T_input - n_fine
        fine_part = np.linspace(0, initial_balance, n_fine, endpoint=False)
        coarse_part = np.linspace(initial_balance, max_grown_balance, n_coarse)
        extended_trad = np.concatenate([fine_part, coarse_part])
    else:
        extended_trad = np.linspace(0, max_grown_balance, G_T_input)
    G_T = len(extended_trad)
    G_R = len(roth_grid)

    # Roth grid spacing — used for O(1) fractional index arithmetic
    d_roth = (roth_grid[-1] - roth_grid[0]) / max(G_R - 1, 1)

    # Terminal values: exact for every (trad, roth) state pair
    trad_terminal = (extended_trad * growth_factor)[:, np.newaxis]  # (G_T, 1)
    roth_terminal = (roth_grid * growth_factor)[np.newaxis, :]  # (1, G_R)
    value_table = np.zeros((n_years + 1, G_T, G_R))
    value_table[n_years] = _compute_retirement_values_2d(
        np.broadcast_to(trad_terminal, (G_T, G_R)).copy(),
        np.broadcast_to(roth_terminal, (G_T, G_R)).copy(),
        scenario,
        n_years,
    )
    policy_table = np.zeros((n_years, G_T, G_R), dtype=np.int64)

    # ── Pre-computation (identical pattern to _dp_backward) ─────────────────
    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)

    taxes = year_taxes(scenario)
    tax_without_cache = [
        taxes[t].federal(scenario.timeline[t].gross_income) for t in range(n_years)
    ]

    rmd_arrays_per_year: list[np.ndarray | None] = []
    for t in range(n_years):
        owner_age = scenario.age + t
        if owner_age >= owner_rmd_start:
            rmd_arrays_per_year.append(
                np.minimum(vectorized_rmd(extended_trad, owner_age), extended_trad)
            )
        else:
            rmd_arrays_per_year.append(None)

    tax_cost_by_year: list[np.ndarray | None] = []
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            tax_cost_by_year.append(None)
        else:
            income_t = scenario.timeline[t].gross_income
            tax_with = taxes[t].federal(income_t + extended_trad)
            tax_cost_by_year.append(tax_with - tax_without_cache[t])

    state_cost_by_year: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            continue
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        if yr_state:
            income_t = scenario.timeline[t].gross_income
            st_with = taxes[t].state_tax(income_t + extended_trad)
            st_without = taxes[t].state_tax(income_t)
            state_cost_by_year[t] = st_with - st_without

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
                    extended_trad,
                    hc.household_size,
                    hc.monthly_slcsp_premium,
                )

    irmaa_cost_by_year: list[np.ndarray | None] = [None] * n_years
    irmaa_discount_ratio = (1 + d) ** (-IRMAA_LOOKBACK_YEARS)
    for t in range(n_years):
        if rmd_arrays_per_year[t] is not None:
            continue
        if scenario.age + t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS:
            income_t = scenario.timeline[t].gross_income
            irmaa_cost_by_year[t] = (
                _irmaa_loss(taxes[t], income_t, extended_trad) * irmaa_discount_ratio
            )

    # ── Backward induction ───────────────────────────────────────────────────
    # Outer Python loop over trad states i; inner numpy ops vectorize over
    # roth states j and conversion options k.
    # Cost of conversion depends on (trad, conv) only — not on roth — so the
    # roth dimension enters only in the future-value bilinear interpolation.

    # Hoist: roth_grid * (1+g) is identical every iteration
    scaled_roth = roth_grid * (1 + g)  # (G_R,)

    for t in range(n_years - 1, -1, -1):
        discount_factor = (1 + d) ** (-t)
        future_ref = value_table[t + 1]  # (G_T, G_R)

        entry_t = scenario.timeline[t]
        owner_age_t = scenario.age + t
        income_t = entry_t.gross_income
        drawdown_t = float(entry_t.drawdown) if entry_t.drawdown is not None else 0.0
        yr_state = resolve_state_for_year(entry_t.state, scenario.state)
        yt_t = taxes[t]
        rmd_arr_t = rmd_arrays_per_year[t]
        has_rmd = rmd_arr_t is not None
        irmaa_exposed_t = owner_age_t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS

        if not has_rmd:
            cost_row = tax_cost_by_year[t].copy()
            if state_cost_by_year[t] is not None:
                cost_row += state_cost_by_year[t]
            # With a spending draw, ACA and IRMAA depend on the balance (added per state)
            if aca_cost_by_year[t] is not None and drawdown_t == 0:
                cost_row += aca_cost_by_year[t]
            if irmaa_cost_by_year[t] is not None and drawdown_t == 0:
                cost_row += irmaa_cost_by_year[t]
            cost_row *= discount_factor
        else:
            cost_row = None

        # Precompute roth interpolation indices for the full trad grid when
        # drawdown_t == 0 and roth_draw is therefore zero for every (i, k).
        # next_roth[k,j] = conv_options[k]*(1+g) + scaled_roth[j]
        # → same for all trad states i; just slice [:n_opts] per state.
        if drawdown_t == 0:
            roth_frac_pre = (
                extended_trad[:, np.newaxis] * (1 + g) + scaled_roth[np.newaxis, :] - roth_grid[0]
            ) / d_roth  # (G_T, G_R)
            roth_lo_pre = np.clip(np.floor(roth_frac_pre).astype(np.int64), 0, G_R - 2)
            frac_r_pre = np.clip(roth_frac_pre - roth_lo_pre, 0.0, 1.0)
            roth_hi_pre = roth_lo_pre + 1  # safe: roth_lo_pre <= G_R-2
        else:
            roth_lo_pre = frac_r_pre = roth_hi_pre = None

        for i in range(G_T):
            available = extended_trad[i]
            if available <= 0:
                value_table[t, i, :] = future_ref[0, :]
                policy_table[t, i, :] = 0
                continue

            rmd_i = float(rmd_arr_t[i]) if has_rmd else 0.0
            rmd_i = min(rmd_i, available)
            available_for_conv = available - rmd_i

            n_opts = int(np.searchsorted(extended_trad, available_for_conv + 1e-9, side="right"))
            n_opts = max(1, min(n_opts, i + 1))
            conv_options = extended_trad[:n_opts]  # (n_opts,)

            # Trad state transition. The RMD counts toward the year's spending.
            avail_after_conv = available_for_conv - conv_options  # (n_opts,)
            need_i = max(0.0, drawdown_t - rmd_i)
            if need_i > 0:
                draw_from_trad = np.minimum(need_i, avail_after_conv)
                roth_draw = need_i - draw_from_trad  # (n_opts,)
                next_trad = (avail_after_conv - draw_from_trad) * (1 + g)
            else:
                draw_from_trad = None
                next_trad = avail_after_conv * (1 + g)  # (n_opts,)

            # Conversion cost (same as _dp_backward)
            if has_rmd:
                eff_income = income_t + rmd_i
                cost_opts = yt_t.total(eff_income + conv_options) - yt_t.total(eff_income)
                if irmaa_exposed_t and need_i == 0:
                    cost_opts += _irmaa_loss(yt_t, eff_income, conv_options) * irmaa_discount_ratio
                cost_opts *= discount_factor
            else:
                cost_opts = cost_row[:n_opts]
            is_aca_t = hc is not None and entry_t.year in aca_years
            if need_i > 0 and (is_aca_t or irmaa_exposed_t):
                cost_opts = cost_opts + discount_factor * _surcharges_with_spending(
                    scenario,
                    yt_t,
                    is_aca_t,
                    irmaa_exposed_t,
                    income_t + rmd_i,
                    available_for_conv,
                    need_i,
                    conv_options,
                    irmaa_discount_ratio,
                )

            # After-tax value of this year's withdrawals (RMD and spending draws),
            # as calculate_npv counts them
            if rmd_i > 0 or need_i > 0:
                cost_opts = cost_opts - discount_factor * _withdrawal_value(
                    scenario, income_t, rmd_i, conv_options, draw_from_trad, need_i, yt_t
                )

            # Bilinear interpolation of future_ref at (next_trad[k], next_roth[k,j])

            # Trad axis: searchsorted on non-uniform grid → (n_opts,)
            trad_lo = np.clip(
                np.searchsorted(extended_trad, next_trad, side="right") - 1, 0, G_T - 2
            )
            trad_spans = extended_trad[trad_lo + 1] - extended_trad[trad_lo]
            frac_t = np.clip(
                np.where(
                    trad_spans > 0,
                    (next_trad - extended_trad[trad_lo]) / trad_spans,
                    0.0,
                ),
                0.0,
                1.0,
            )  # (n_opts,)

            # future_ref rows at trad bracket bounds → (n_opts, G_R)
            future_lo_t = future_ref[trad_lo, :]
            future_hi_t = future_ref[trad_lo + 1, :]
            future_at_trad = future_lo_t + frac_t[:, np.newaxis] * (
                future_hi_t - future_lo_t
            )  # (n_opts, G_R)

            # Roth axis: use precomputed slices when nothing is drawn,
            # otherwise compute per-state from roth_draw
            if need_i == 0 and roth_lo_pre is not None:
                roth_lo = roth_lo_pre[:n_opts]  # (n_opts, G_R) — zero-copy slice
                frac_r = frac_r_pre[:n_opts]  # (n_opts, G_R)
                roth_hi = roth_hi_pre[:n_opts]  # (n_opts, G_R)
            else:
                delta_k = conv_options * (1 + g)  # (n_opts,)
                if need_i > 0:
                    delta_k = delta_k - roth_draw * (1 + g)
                next_roth = np.clip(
                    delta_k[:, np.newaxis] + scaled_roth[np.newaxis, :],
                    0.0,
                    roth_grid[-1],
                )  # (n_opts, G_R)
                roth_frac_idx = (next_roth - roth_grid[0]) / d_roth
                roth_lo = np.clip(np.floor(roth_frac_idx).astype(np.int64), 0, G_R - 2)
                frac_r = np.clip(roth_frac_idx - roth_lo, 0.0, 1.0)
                roth_hi = roth_lo + 1

            # Gather at roth bracket bounds; take_along_axis is more efficient
            # than 2D fancy indexing for this row-wise gather pattern
            future_lo_r = np.take_along_axis(future_at_trad, roth_lo, axis=1)
            future_hi_r = np.take_along_axis(future_at_trad, roth_hi, axis=1)
            future_bilinear = future_lo_r + frac_r * (future_hi_r - future_lo_r)

            values = -cost_opts[:, np.newaxis] + future_bilinear  # (n_opts, G_R)
            best_k = np.argmax(values, axis=0)  # (G_R,)
            value_table[t, i, :] = values[best_k, np.arange(G_R)]
            policy_table[t, i, :] = best_k

    return value_table, policy_table, extended_trad, roth_grid


def _forward_pass_2d(
    scenario: ScenarioInput,
    extended_trad: np.ndarray,
    roth_grid: np.ndarray,
    policy_table: np.ndarray,
) -> list[float]:
    """Extract optimal conversions by tracking (trad, roth) state forward."""
    n_years = len(scenario.timeline)
    g = scenario.real_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    G_R = len(roth_grid)
    d_roth = (roth_grid[-1] - roth_grid[0]) / max(G_R - 1, 1)
    conversions = []

    current_trad = float(scenario.traditional_ira_balance)
    current_roth = float(scenario.roth_ira_balance)

    for t in range(n_years):
        entry = scenario.timeline[t]
        owner_age = scenario.age + t

        rmd_t = 0.0
        if owner_age >= owner_rmd_start:
            rmd_t = min(calculate_rmd(current_trad, owner_age), current_trad)
        available_for_conv = max(0.0, current_trad - rmd_t)

        # Snap to nearest grid indices
        trad_idx = max(
            0,
            min(
                int(np.searchsorted(extended_trad, current_trad, side="right") - 1),
                len(extended_trad) - 1,
            ),
        )
        roth_raw = (current_roth - roth_grid[0]) / d_roth if d_roth > 0 else 0.0
        roth_idx = max(0, min(int(round(roth_raw)), G_R - 1))

        conv_idx = int(policy_table[t, trad_idx, roth_idx])
        conversion = float(extended_trad[conv_idx]) if conv_idx < len(extended_trad) else 0.0
        conversion = min(conversion, available_for_conv)
        conversions.append(round_to_resolution(conversion))

        # Exact state transitions
        balance_after_conv = available_for_conv - conversion
        drawdown_t = draw_beyond_rmd(entry.drawdown, rmd_t)
        if drawdown_t > 0:
            draw_from_trad = min(drawdown_t, balance_after_conv)
            roth_draw = max(0.0, drawdown_t - draw_from_trad)
            balance_after_conv -= draw_from_trad
            current_roth = max(0.0, current_roth + conversion - roth_draw) * (1 + g)
        else:
            current_roth = (current_roth + conversion) * (1 + g)

        current_trad = balance_after_conv * (1 + g)

    return conversions


def dp_optimize(
    scenario: ScenarioInput,
    trad_grid_size: int = 200,
    roth_grid_size: int = 150,
) -> DPResult:
    """2D DP optimizer: state = (trad_balance, roth_balance).

    Tracks the Roth balance as a second state dimension so terminal values are
    computed exactly for every (trad, roth) pair, eliminating the
    no-conversion-trajectory approximation that caused suboptimal results for
    scenarios with RMD years inside the planning timeline.

    Single-pass: no coarse/fine split needed.  ``optimizer.optimize()`` calls
    ``_finalize_conversions`` afterward for $100 display precision.
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

    g = scenario.real_growth_rate

    # Trad input grid — extended internally by _dp_backward_2d for growth
    trad_grid = np.linspace(0, balance, trad_grid_size)

    # Roth grid: uniform, sized to cover the maximum possible roth at timeline end
    max_roth = (scenario.roth_ira_balance + balance) * (1 + g) ** n_years * 1.1
    max_roth = max(max_roth, scenario.roth_ira_balance * 1.1, 1.0)
    roth_grid = np.linspace(0, max_roth, roth_grid_size)

    _, policy_table, extended_trad, roth_grid = _dp_backward_2d(scenario, trad_grid, roth_grid)
    conversions = _forward_pass_2d(scenario, extended_trad, roth_grid, policy_table)
    total = sum(conversions)

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
        g = scenario.real_growth_rate
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
    g = scenario.real_growth_rate
    d = scenario.real_discount_rate
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

    terminal_values = _compute_retirement_values(
        trad_at_drawdown_start, roth_at_drawdown_start, scenario, n_years
    )
    # Broadcast: same terminal value for all budget levels
    value_table[n_years] = terminal_values[:, np.newaxis]  # (G, 1) → (G, B)

    # Determine ACA coverage years (same as 2D)
    hc = scenario.healthcare
    aca_years = _aca_coverage_years(scenario)

    # RMD start age for the owner
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)

    # Pre-compute tax costs (same as 2D)
    taxes = year_taxes(scenario)
    tax_without_cache = [
        taxes[t].federal(scenario.timeline[t].gross_income) for t in range(n_years)
    ]

    # Pre-compute per-year RMD arrays. None for non-RMD years.
    # For RMD years, tax/state/IRMAA costs depend on the balance state (via the RMD
    # income base), so they must be computed per-state inside the backward loop.
    # For non-RMD years, costs are balance-independent and can be pre-computed once.
    rmd_arrays_per_year_3d: list[np.ndarray | None] = []
    for t in range(n_years):
        owner_age = scenario.age + t
        if owner_age >= owner_rmd_start:
            rmd_arrays_per_year_3d.append(
                np.minimum(vectorized_rmd(extended_grid, owner_age), extended_grid)
            )
        else:
            rmd_arrays_per_year_3d.append(None)

    # Tax cost indexed by conversion amount j. None for RMD years (computed per-state).
    tax_cost_by_year: list[np.ndarray | None] = []
    for t in range(n_years):
        if rmd_arrays_per_year_3d[t] is not None:
            tax_cost_by_year.append(None)
        else:
            income_t = scenario.timeline[t].gross_income
            tax_with = taxes[t].federal(income_t + extended_grid)
            tax_cost_by_year.append(tax_with - tax_without_cache[t])

    # State tax cost indexed by conversion amount j. None for RMD years.
    state_cost_by_year_3d: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        if rmd_arrays_per_year_3d[t] is not None:
            continue  # per-state in loop
        yr_state = resolve_state_for_year(scenario.timeline[t].state, scenario.state)
        if yr_state:
            income_t = scenario.timeline[t].gross_income
            st_with = taxes[t].state_tax(income_t + extended_grid)
            st_without = taxes[t].state_tax(income_t)
            state_cost_by_year_3d[t] = st_with - st_without

    aca_cost_by_year: list[np.ndarray | None] = [None] * n_years
    if hc:
        for t in range(n_years):
            if rmd_arrays_per_year_3d[t] is not None:
                continue  # ACA and RMDs don't overlap (ACA < 65, RMDs >= 73)
            year_t = scenario.timeline[t].year
            if year_t in aca_years:
                income_t = scenario.timeline[t].gross_income
                aca_cost_by_year[t] = vectorized_subsidy_loss(
                    income_t,
                    extended_grid,
                    hc.household_size,
                    hc.monthly_slcsp_premium,
                )

    # IRMAA cost indexed by conversion amount j. extended_grid is treated as
    # conversion amounts here (not balance states). None for RMD years.
    irmaa_cost_by_year_3d: list[np.ndarray | None] = [None] * n_years
    irmaa_discount_ratio = (1 + d) ** (-IRMAA_LOOKBACK_YEARS)
    for t in range(n_years):
        if rmd_arrays_per_year_3d[t] is not None:
            continue  # per-state in loop (income base includes rmd(grid[i]))
        if scenario.age + t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS:
            income_t = scenario.timeline[t].gross_income
            irmaa_arr = _irmaa_loss(taxes[t], income_t, extended_grid)
            irmaa_cost_by_year_3d[t] = irmaa_arr * irmaa_discount_ratio

    # Backward induction — vectorized bilinear interpolation across the budget dimension.
    # For non-RMD years: cost_row[j] is pre-computed (balance-independent), shared across
    # all states i. For RMD years: cost_opts[j] is computed per-state using the correct
    # income base income_t + rmd(grid[i]).
    for t in range(n_years - 1, -1, -1):
        discount_factor = (1 + d) ** (-t)
        future_ref = value_table[t + 1]  # shape (G, B)

        entry_t = scenario.timeline[t]
        owner_age_t = scenario.age + t
        income_t = entry_t.gross_income
        drawdown_t = float(entry_t.drawdown) if entry_t.drawdown is not None else 0.0
        yr_state = resolve_state_for_year(entry_t.state, scenario.state)
        yt_t = taxes[t]
        rmd_arr_t = rmd_arrays_per_year_3d[t]
        has_rmd = rmd_arr_t is not None
        irmaa_exposed_t = owner_age_t >= MEDICARE_START_AGE - IRMAA_LOOKBACK_YEARS

        # Build shared cost_row for non-RMD years (cost_row[j] = cost of converting grid[j])
        if not has_rmd:
            cost_row = tax_cost_by_year[t].copy()
            if state_cost_by_year_3d[t] is not None:
                cost_row += state_cost_by_year_3d[t]
            # With a spending draw, ACA and IRMAA depend on the balance (added per state)
            if aca_cost_by_year[t] is not None and drawdown_t == 0:
                cost_row += aca_cost_by_year[t]
            if irmaa_cost_by_year_3d[t] is not None and drawdown_t == 0:
                cost_row += irmaa_cost_by_year_3d[t]
            cost_row *= discount_factor
        else:
            cost_row = None  # computed per-state below

        for i in range(G):
            available = extended_grid[i]
            if available <= 0:
                value_table[t, i, :] = value_table[t + 1, 0, :]
                policy_table[t, i, :] = 0
                continue

            # Deduct RMD before conversion; this caps the conversion option range.
            rmd_i = float(rmd_arr_t[i]) if has_rmd else 0.0
            rmd_i = min(rmd_i, available)
            available_for_conv = available - rmd_i

            n_opts = int(np.searchsorted(extended_grid, available_for_conv + 1e-9, side="right"))
            n_opts = max(1, min(n_opts, i + 1))
            conv_options = extended_grid[:n_opts]

            # State transition: conversion + drawdown, then grow.
            avail_after_conv = available_for_conv - conv_options  # shape (n_opts,)
            need_i = max(0.0, drawdown_t - rmd_i)
            if drawdown_t > 0:
                draw_from_trad = np.minimum(need_i, avail_after_conv)
                remaining_bal = (avail_after_conv - draw_from_trad) * (1 + g)
            else:
                remaining_bal = avail_after_conv * (1 + g)

            # Per-state cost for RMD years: income base is income_t + rmd(grid[i]).
            if has_rmd:
                eff_income = income_t + rmd_i
                cost_opts = yt_t.total(eff_income + conv_options) - yt_t.total(eff_income)
                if irmaa_exposed_t and need_i == 0:
                    cost_opts = (
                        cost_opts
                        + _irmaa_loss(yt_t, eff_income, conv_options) * irmaa_discount_ratio
                    )
                cost_opts = cost_opts * discount_factor
            else:
                cost_opts = cost_row[:n_opts]
            is_aca_t = hc is not None and entry_t.year in aca_years
            if need_i > 0 and (is_aca_t or irmaa_exposed_t):
                cost_opts = cost_opts + discount_factor * _surcharges_with_spending(
                    scenario,
                    yt_t,
                    is_aca_t,
                    irmaa_exposed_t,
                    income_t + rmd_i,
                    available_for_conv,
                    need_i,
                    conv_options,
                    irmaa_discount_ratio,
                )

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
            # For conversion j at budget state k, remaining_budget = budget_grid[k] - grid[j].
            remaining_budgets = (
                budget_grid[np.newaxis, :] - conv_options[:, np.newaxis]
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
            invalid = conv_options[:, np.newaxis] > budget_grid[np.newaxis, :] + 1e-6
            values_matrix = -cost_opts[:, np.newaxis] + future_matrix
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
    g = scenario.real_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
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
            drawdown_t = draw_beyond_rmd(entry.drawdown, rmd_t)
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
        drawdown_t = draw_beyond_rmd(entry.drawdown, rmd_t)
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
        g = scenario.real_growth_rate
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
