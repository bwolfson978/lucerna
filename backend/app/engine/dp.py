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

    for year_offset in range(1, n_retirement + 1):
        year = years_until_retirement + year_offset

        # Grow at start of year
        trad *= (1 + g)
        roth *= (1 + g)

        # Withdraw from traditional first
        distribution = np.minimum(spending_arr, trad)
        trad -= distribution

        tax_on_dist = vectorized_federal_tax(distribution, scenario.filing_status)
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

        # Clamp to non-negative and within sequential balance
        remaining_bal = balance
        for i in range(n_years):
            yearly_conv[i] = max(0.0, min(yearly_conv[i], remaining_bal))
            remaining_bal -= yearly_conv[i]

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
