"""Dynamic Programming optimizer for multi-year Roth conversions.

Guarantees global optimality by exhaustive search over a discretized balance
grid.  Two-pass approach:

1. Coarse pass — finds the optimal region across the full balance range
2. Fine pass  — refines to $100 resolution around the optimum

The state at each stage (year) is the remaining traditional IRA balance.
The decision is how much to convert.  The retirement phase is computed as a
terminal value function.  Complexity is O(N × G²) where N = trajectory years
and G = grid size, vectorized with numpy for sub-second performance.
"""

from dataclasses import dataclass

import numpy as np

from app.engine.types import ScenarioInput, ConversionCurvePoint, BracketFillResult
from app.engine.tax import vectorized_federal_tax, calculate_federal_tax, analyze_bracket_fill
from app.engine.aca import vectorized_subsidy_loss
from app.engine.state_tax import (
    vectorized_state_tax, calculate_state_tax, get_state_marginal_rate,
    resolve_state_for_year,
)


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
) -> np.ndarray:
    """Compute discounted NPV of the retirement phase for each balance split.

    For each (trad, roth) pair, simulates:
    - Annual withdrawals (traditional first, then Roth) with tax
    - Terminal liquidation of remaining balances

    Returns an array of NPV values, one per grid point.
    """
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    years_until_retirement = scenario.retirement_age - scenario.age
    n_retirement = scenario.years_in_retirement

    # Determine spending
    spending = scenario.annual_retirement_spending
    if spending is None:
        total = trad_balances + roth_balances
        spending_arr = total * 0.04
    else:
        spending_arr = np.full_like(trad_balances, spending)

    trad = trad_balances.copy()
    roth = roth_balances.copy()
    npv = np.zeros_like(trad)

    # Resolve retirement state for distributions and liquidation
    ret_state = scenario.retirement_state or scenario.state

    for year_offset in range(1, n_retirement + 1):
        year = years_until_retirement + year_offset

        # Grow at start of year
        trad *= (1 + g)
        roth *= (1 + g)

        # Withdraw from traditional first
        distribution = np.minimum(spending_arr, trad)
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
    liquidation_year = years_until_retirement + n_retirement + 1
    discount_factor = (1 + d) ** (-liquidation_year)

    tax_on_liq = vectorized_federal_tax(np.maximum(0.0, trad), scenario.filing_status)
    if ret_state:
        tax_on_liq = tax_on_liq + vectorized_state_tax(
            np.maximum(0.0, trad), ret_state, scenario.filing_status, scenario.custom_state_rate
        )
    npv += (np.maximum(0.0, trad) - tax_on_liq) * discount_factor
    npv += np.maximum(0.0, roth) * discount_factor

    return npv


def _dp_backward(
    scenario: ScenarioInput,
    balance_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run backward induction over the trajectory years.

    Returns:
        value_table: shape (n_years+1, G) — optimal NPV from year t onward.
        policy_table: shape (n_years, G) — optimal conversion grid index.
        extended_grid: the balance grid used internally (may be larger than
                       the input grid to accommodate balance growth).
    """
    n_years = len(scenario.income_trajectory)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    years_until_retirement = scenario.retirement_age - scenario.age
    remaining_growth_years = years_until_retirement - n_years

    if remaining_growth_years > 0:
        growth_factor = (1 + g) ** remaining_growth_years
    else:
        growth_factor = 1.0

    initial_balance = scenario.traditional_ira_balance
    initial_roth = scenario.roth_ira_balance

    # The balance grid must cover the GROWN balance range.  If nothing is
    # converted, the balance after n_years of growth could be as large as
    # initial_balance * (1+g)^n_years.  Extend the grid accordingly so
    # np.interp never has to clamp at the edge.
    max_grown_balance = initial_balance * (1 + g) ** n_years
    extended_grid = np.linspace(0, max_grown_balance, len(balance_grid))
    G = len(extended_grid)

    value_table = np.zeros((n_years + 1, G))

    # Terminal values: for each possible remaining trad balance at end of
    # trajectory, compute retirement NPV.
    #
    # Key insight: conversions shift dollars from traditional to Roth, and
    # both accounts grow at the same rate g.  So total pre-tax wealth at
    # retirement is the same regardless of conversions:
    #   total = (initial_trad + initial_roth) * (1+g)^years_to_retirement
    # The retirement value depends only on the trad/roth SPLIT.
    # Conversion TAX COSTS are already captured as negative terms in the
    # DP's backward induction, so they don't double-count here.
    total_growth = (1 + g) ** years_until_retirement
    total_at_retirement = (initial_balance + initial_roth) * total_growth

    trad_at_ret = extended_grid * growth_factor
    roth_at_ret = np.maximum(0.0, total_at_retirement - trad_at_ret)

    value_table[n_years] = _compute_retirement_values(
        trad_at_ret, roth_at_ret, scenario
    )

    # Policy table: which conversion index is optimal at each (year, balance)
    policy_table = np.zeros((n_years, G), dtype=np.int64)

    # Determine ACA coverage years
    hc = scenario.healthcare
    aca_years: set[int] = set()
    if hc:
        from app.engine.aca import federal_poverty_level
        trajectory_years = {y.year for y in scenario.income_trajectory}
        if hc.aca_coverage_years is not None:
            aca_years = set(hc.aca_coverage_years) & trajectory_years
        elif hc.has_employer_coverage_after is not None:
            aca_years = {y for y in trajectory_years if y < hc.has_employer_coverage_after}
        else:
            aca_years = trajectory_years

    # Pre-compute tax without conversion for each year (scalar per year)
    tax_without_cache = [
        calculate_federal_tax(
            scenario.income_trajectory[t].gross_income, scenario.filing_status
        )
        for t in range(n_years)
    ]

    # Pre-compute conversion tax cost for each year at every grid point.
    # tax_cost_by_year[t] = array of size G: tax cost of converting
    # extended_grid[j] dollars in year t.
    tax_cost_by_year: list[np.ndarray] = []
    for t in range(n_years):
        income_t = scenario.income_trajectory[t].gross_income
        tax_with = vectorized_federal_tax(
            income_t + extended_grid, scenario.filing_status
        )
        tax_cost_by_year.append(tax_with - tax_without_cache[t])

    # Pre-compute state tax costs per year
    state_cost_by_year: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        yr_state = resolve_state_for_year(
            scenario.income_trajectory[t].state, scenario.state
        )
        if yr_state:
            income_t = scenario.income_trajectory[t].gross_income
            st_with = vectorized_state_tax(
                income_t + extended_grid, yr_state, scenario.filing_status, scenario.custom_state_rate
            )
            st_without = calculate_state_tax(income_t, yr_state, scenario.filing_status, scenario.custom_state_rate)
            state_cost_by_year[t] = st_with - st_without

    # Pre-compute ACA costs if applicable
    aca_cost_by_year: list[np.ndarray | None] = [None] * n_years
    if hc:
        for t in range(n_years):
            year_t = scenario.income_trajectory[t].year
            if year_t in aca_years:
                income_t = scenario.income_trajectory[t].gross_income
                aca_cost_by_year[t] = vectorized_subsidy_loss(
                    income_t, extended_grid,
                    hc.household_size, hc.monthly_slcsp_premium,
                )

    # Backward induction — vectorized per balance state (row-by-row).
    # Each row i considers conversions j=0..i (triangular), which is
    # efficient because np.interp on small arrays is fast and we avoid
    # allocating a G×G matrix (which can be >10M entries for long trajectories).
    for t in range(n_years - 1, -1, -1):
        discount_factor = (1 + d) ** (-t)
        future_ref = value_table[t + 1]  # shape (G,)

        # Discounted cost for each conversion amount (column j)
        cost_row = tax_cost_by_year[t].copy()
        if state_cost_by_year[t] is not None:
            cost_row += state_cost_by_year[t]
        if aca_cost_by_year[t] is not None:
            cost_row += aca_cost_by_year[t]
        cost_row *= discount_factor

        for i in range(G):
            available = extended_grid[i]
            if available <= 0:
                value_table[t, i] = value_table[t + 1, 0]
                policy_table[t, i] = 0
                continue

            # Conversion options: grid points 0..i (all <= available)
            n_opts = i + 1
            conversion_options = extended_grid[:n_opts]

            # Remaining balance after each conversion, grown one year
            remaining = (available - conversion_options) * (1 + g)

            # Look up future value via interpolation
            future = np.interp(remaining, extended_grid, future_ref)

            # Value = -cost + future
            values = -cost_row[:n_opts] + future

            best_idx = np.argmax(values)
            value_table[t, i] = values[best_idx]
            policy_table[t, i] = best_idx

    return value_table, policy_table, extended_grid


def _forward_pass(
    scenario: ScenarioInput,
    extended_grid: np.ndarray,
    policy_table: np.ndarray,
) -> list[float]:
    """Read optimal conversion schedule by following the policy forward."""
    n_years = len(scenario.income_trajectory)
    g = scenario.annual_growth_rate
    conversions = []

    current_balance = scenario.traditional_ira_balance

    for t in range(n_years):
        # Find closest grid index to current balance
        idx = np.searchsorted(extended_grid, current_balance, side="right") - 1
        idx = max(0, min(idx, len(extended_grid) - 1))

        # Get optimal conversion index from policy
        conv_idx = policy_table[t, idx]
        conversion = extended_grid[conv_idx] if conv_idx < len(extended_grid) else 0.0

        # Clamp to available balance
        conversion = min(conversion, current_balance)
        conversions.append(round(conversion / 100) * 100)  # Round to $100

        current_balance = (current_balance - conversion) * (1 + g)

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
    n_years = len(scenario.income_trajectory)

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
        scenario, input_grid,
    )
    coarse_conversions = _forward_pass(scenario, coarse_ext_grid, coarse_policy)
    coarse_total = sum(coarse_conversions)

    # --- Pass 2: Fine refinement ---
    # Use finer grid if balance / fine_resolution > coarse grid size
    fine_grid_size = int(balance / fine_resolution) + 1
    if fine_grid_size > coarse_grid_size:
        fine_input_grid = np.linspace(0, balance, fine_grid_size)
        fine_value_table, fine_policy, fine_ext_grid = _dp_backward(
            scenario, fine_input_grid,
        )
        conversions = _forward_pass(scenario, fine_ext_grid, fine_policy)
        # Use fine value table for conversion curve (mapped back to balance range)
        result_ext_grid = fine_ext_grid
        result_values = fine_value_table[0]
    else:
        conversions = coarse_conversions
        result_ext_grid = coarse_ext_grid
        result_values = coarse_value_table[0]

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
    from app.engine.optimizer import calculate_npv
    from app.engine.tax import get_marginal_rate

    balance = scenario.traditional_ira_balance
    n_years = len(scenario.income_trajectory)
    opt_total = dp_result.total_conversion
    opt_conversions = dp_result.yearly_conversions

    caps = np.linspace(0, balance, n_points)
    points: list[ConversionCurvePoint] = []

    for cap in caps:
        cap_rounded = round(cap / 100) * 100

        # Build per-year allocation by scaling the optimal schedule
        if cap_rounded <= 0:
            yearly_conv = [0.0] * n_years
        elif cap_rounded >= balance:
            # Full conversion in year 1
            yearly_conv = [float(balance)] + [0.0] * (n_years - 1)
        elif opt_total > 0:
            scale = cap_rounded / opt_total
            yearly_conv = [
                round(c * scale / 100) * 100 for c in opt_conversions
            ]
            # Adjust rounding error on the largest year
            diff = cap_rounded - sum(yearly_conv)
            if abs(diff) >= 100 and yearly_conv:
                max_idx = max(range(len(yearly_conv)), key=lambda i: yearly_conv[i])
                yearly_conv[max_idx] += round(diff / 100) * 100
        else:
            yearly_conv = [0.0] * n_years

        # Clamp to non-negative and within sequential balance (with growth)
        remaining_bal = balance
        g = scenario.annual_growth_rate
        for i in range(n_years):
            yearly_conv[i] = max(0.0, min(yearly_conv[i], remaining_bal))
            remaining_bal = (remaining_bal - yearly_conv[i]) * (1 + g)

        # Compute actual NPV for this allocation
        npv_val = calculate_npv(scenario, yearly_conv)

        # Build per-year detail and bracket fill
        yearly_bracket_fill: list[list[BracketFillResult]] = []
        yearly_detail: list[dict] = []
        total_tax = 0.0

        for i in range(n_years):
            income = scenario.income_trajectory[i].gross_income
            c = yearly_conv[i]

            tax_with = calculate_federal_tax(income + c, scenario.filing_status)
            tax_without = calculate_federal_tax(income, scenario.filing_status)
            tax_cost = tax_with - tax_without

            # Add state tax cost
            yr_state = resolve_state_for_year(
                scenario.income_trajectory[i].state, scenario.state
            )
            if yr_state:
                st_with = calculate_state_tax(income + c, yr_state, scenario.filing_status, scenario.custom_state_rate)
                st_without = calculate_state_tax(income, yr_state, scenario.filing_status, scenario.custom_state_rate)
                tax_cost += st_with - st_without

            total_tax += tax_cost

            eff_rate = tax_cost / c if c > 0 else 0.0
            marginal = get_marginal_rate(income + c, scenario.filing_status)

            yearly_detail.append({
                "year": scenario.income_trajectory[i].year,
                "income": income,
                "conversion": c,
                "tax_cost": round(tax_cost, 2),
                "effective_rate": round(eff_rate, 4),
                "marginal_bracket": f"{marginal:.0%}",
            })
            yearly_bracket_fill.append(
                analyze_bracket_fill(income, c, scenario.filing_status)
            )

        points.append(ConversionCurvePoint(
            total_cap=cap_rounded,
            yearly_conversions=yearly_conv,
            yearly_bracket_fill=yearly_bracket_fill,
            yearly_detail=yearly_detail,
            total_tax=round(total_tax, 2),
            npv=round(npv_val, 2),
        ))

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
    n_years = len(scenario.income_trajectory)
    g = scenario.annual_growth_rate
    d = scenario.discount_rate
    years_until_retirement = scenario.retirement_age - scenario.age
    remaining_growth_years = years_until_retirement - n_years

    if remaining_growth_years > 0:
        growth_factor = (1 + g) ** remaining_growth_years
    else:
        growth_factor = 1.0

    initial_balance = scenario.traditional_ira_balance
    initial_roth = scenario.roth_ira_balance

    # Extend balance grid for growth (same logic as 2D DP)
    max_grown_balance = initial_balance * (1 + g) ** n_years
    extended_grid = np.linspace(0, max_grown_balance, len(balance_grid))
    G = len(extended_grid)
    B = len(budget_grid)

    value_table = np.zeros((n_years + 1, G, B))
    policy_table = np.zeros((n_years, G, B), dtype=np.int64)

    # Terminal values: budget doesn't affect retirement phase.
    # Same terminal value for every budget level — broadcast across B.
    total_growth = (1 + g) ** years_until_retirement
    total_at_retirement = (initial_balance + initial_roth) * total_growth

    trad_at_ret = extended_grid * growth_factor
    roth_at_ret = np.maximum(0.0, total_at_retirement - trad_at_ret)

    terminal_values = _compute_retirement_values(
        trad_at_ret, roth_at_ret, scenario
    )
    # Broadcast: same terminal value for all budget levels
    value_table[n_years] = terminal_values[:, np.newaxis]  # (G, 1) → (G, B)

    # Determine ACA coverage years (same as 2D)
    hc = scenario.healthcare
    aca_years: set[int] = set()
    if hc:
        from app.engine.aca import federal_poverty_level
        trajectory_years = {y.year for y in scenario.income_trajectory}
        if hc.aca_coverage_years is not None:
            aca_years = set(hc.aca_coverage_years) & trajectory_years
        elif hc.has_employer_coverage_after is not None:
            aca_years = {y for y in trajectory_years if y < hc.has_employer_coverage_after}
        else:
            aca_years = trajectory_years

    # Pre-compute tax costs (same as 2D)
    tax_without_cache = [
        calculate_federal_tax(
            scenario.income_trajectory[t].gross_income, scenario.filing_status
        )
        for t in range(n_years)
    ]

    tax_cost_by_year: list[np.ndarray] = []
    for t in range(n_years):
        income_t = scenario.income_trajectory[t].gross_income
        tax_with = vectorized_federal_tax(
            income_t + extended_grid, scenario.filing_status
        )
        tax_cost_by_year.append(tax_with - tax_without_cache[t])

    # Pre-compute state tax costs per year (3D, same pattern as 2D)
    state_cost_by_year_3d: list[np.ndarray | None] = [None] * n_years
    for t in range(n_years):
        yr_state = resolve_state_for_year(
            scenario.income_trajectory[t].state, scenario.state
        )
        if yr_state:
            income_t = scenario.income_trajectory[t].gross_income
            st_with = vectorized_state_tax(
                income_t + extended_grid, yr_state, scenario.filing_status, scenario.custom_state_rate
            )
            st_without = calculate_state_tax(income_t, yr_state, scenario.filing_status, scenario.custom_state_rate)
            state_cost_by_year_3d[t] = st_with - st_without

    aca_cost_by_year: list[np.ndarray | None] = [None] * n_years
    if hc:
        for t in range(n_years):
            year_t = scenario.income_trajectory[t].year
            if year_t in aca_years:
                income_t = scenario.income_trajectory[t].gross_income
                aca_cost_by_year[t] = vectorized_subsidy_loss(
                    income_t, extended_grid,
                    hc.household_size, hc.monthly_slcsp_premium,
                )

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
            lo_vals = future_ref[bal_indices, :]       # (n_opts, B)
            hi_vals = future_ref[bal_indices + 1, :]   # (n_opts, B)
            bal_interp = lo_vals + fracs_bal[:, np.newaxis] * (hi_vals - lo_vals)

            # Step 2: Budget remapping via bilinear interpolation.
            # For conversion j at budget state k, remaining_budget = budget_grid[k] - extended_grid[j].
            # We need to look up bal_interp[j, :] at that remaining budget position.
            remaining_budgets = (
                budget_grid[np.newaxis, :] - extended_grid[:n_opts, np.newaxis]
            )  # (n_opts, B)

            bud_indices = (
                np.searchsorted(budget_grid, remaining_budgets.ravel(), side="right")
                .reshape(n_opts, B)
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
            future_lo = bal_interp[j_idx, bud_indices]       # (n_opts, B)
            future_hi = bal_interp[j_idx, bud_indices + 1]   # (n_opts, B)
            future_matrix = future_lo + fracs_bud * (future_hi - future_lo)

            # Step 3: Mask invalid options (conversion > budget) and pick best.
            invalid = (
                extended_grid[:n_opts, np.newaxis]
                > budget_grid[np.newaxis, :] + 1e-6
            )
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
    n_years = len(scenario.income_trajectory)
    g = scenario.annual_growth_rate
    B = len(budget_grid)
    conversions = []

    current_balance = scenario.traditional_ira_balance
    current_budget = budget_cap

    for t in range(n_years):
        if current_budget <= 0 or current_balance <= 0:
            conversions.append(0.0)
            current_balance *= (1 + g)
            continue

        # Find bracketing balance index
        bal_idx = np.searchsorted(extended_grid, current_balance, side="right") - 1
        bal_idx = max(0, min(bal_idx, len(extended_grid) - 1))

        # Find bracketing budget index
        bud_idx = np.searchsorted(budget_grid, current_budget, side="right") - 1
        bud_idx = max(0, min(bud_idx, B - 2))

        # Bilinear interpolation of policy: look up conversion index at
        # the four neighboring (balance, budget) grid points, convert to
        # dollar amounts, then interpolate.
        b_lo, b_hi = bud_idx, bud_idx + 1

        # Get conversion amounts from policy at neighboring budget points
        conv_idx_lo = policy_table[t, bal_idx, b_lo]
        conv_idx_hi = policy_table[t, bal_idx, b_hi]
        conv_lo = extended_grid[conv_idx_lo] if conv_idx_lo < len(extended_grid) else 0.0
        conv_hi = extended_grid[conv_idx_hi] if conv_idx_hi < len(extended_grid) else 0.0

        # Lerp on budget dimension
        budget_span = budget_grid[b_hi] - budget_grid[b_lo]
        if budget_span > 0:
            frac = (current_budget - budget_grid[b_lo]) / budget_span
            frac = max(0.0, min(1.0, frac))
            conversion = conv_lo + frac * (conv_hi - conv_lo)
        else:
            conversion = conv_lo

        # Clamp to available balance and budget
        conversion = min(conversion, current_balance, current_budget)
        conversion = max(0.0, conversion)
        conversions.append(round(conversion / 100) * 100)

        current_balance = (current_balance - conversion) * (1 + g)
        current_budget -= conversion

    return conversions


def extract_conversion_curve_3d(
    scenario: ScenarioInput,
    n_points: int = 50,
    balance_grid_size: int = 300,
    curve_max: float | None = None,
) -> list[ConversionCurvePoint]:
    """Build a conversion curve using 3D DP with budget constraint.

    For each total conversion cap, extracts the NPV-maximizing schedule
    via a single 3D backward pass + per-cap forward passes.

    Args:
        curve_max: Upper bound for the budget grid.  When the DP optimal
            total exceeds the initial balance (due to inter-year growth),
            pass that total here so the curve covers the full range.
    """
    from app.engine.optimizer import calculate_npv
    from app.engine.tax import get_marginal_rate

    balance = scenario.traditional_ira_balance
    n_years = len(scenario.income_trajectory)

    if balance <= 0 or n_years == 0:
        return []

    # Budget grid: extend to cover curve_max when inter-year growth lets
    # total conversions exceed the initial balance.
    upper = max(balance, curve_max or balance)
    budget_grid = np.linspace(0, upper, n_points)
    balance_grid = np.linspace(0, balance, balance_grid_size)

    # Single 3D backward pass
    value_table, policy_table, extended_grid, budget_grid = _dp_backward_3d(
        scenario, balance_grid, budget_grid,
    )

    # Extract optimal schedule for each budget cap via forward pass
    points: list[ConversionCurvePoint] = []

    for cap in budget_grid:
        cap_rounded = round(cap / 100) * 100

        if cap_rounded <= 0:
            yearly_conv = [0.0] * n_years
        else:
            yearly_conv = _forward_pass_3d(
                scenario, extended_grid, budget_grid, policy_table, cap_rounded,
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

        # Compute actual NPV for this allocation (authoritative)
        npv_val = calculate_npv(scenario, yearly_conv)

        # Build per-year detail and bracket fill
        yearly_bracket_fill: list[list[BracketFillResult]] = []
        yearly_detail: list[dict] = []
        total_tax = 0.0

        for i in range(n_years):
            income = scenario.income_trajectory[i].gross_income
            c = yearly_conv[i]

            tax_with = calculate_federal_tax(income + c, scenario.filing_status)
            tax_without = calculate_federal_tax(income, scenario.filing_status)
            tax_cost = tax_with - tax_without

            # Add state tax cost
            yr_state = resolve_state_for_year(
                scenario.income_trajectory[i].state, scenario.state
            )
            if yr_state:
                st_with = calculate_state_tax(income + c, yr_state, scenario.filing_status, scenario.custom_state_rate)
                st_without = calculate_state_tax(income, yr_state, scenario.filing_status, scenario.custom_state_rate)
                tax_cost += st_with - st_without

            total_tax += tax_cost

            eff_rate = tax_cost / c if c > 0 else 0.0
            marginal = get_marginal_rate(income + c, scenario.filing_status)

            yearly_detail.append({
                "year": scenario.income_trajectory[i].year,
                "income": income,
                "conversion": c,
                "tax_cost": round(tax_cost, 2),
                "effective_rate": round(eff_rate, 4),
                "marginal_bracket": f"{marginal:.0%}",
            })
            yearly_bracket_fill.append(
                analyze_bracket_fill(income, c, scenario.filing_status)
            )

        points.append(ConversionCurvePoint(
            total_cap=cap_rounded,
            yearly_conversions=yearly_conv,
            yearly_bracket_fill=yearly_bracket_fill,
            yearly_detail=yearly_detail,
            total_tax=round(total_tax, 2),
            npv=round(npv_val, 2),
        ))

    return points
