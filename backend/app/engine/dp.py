"""Dynamic programming search for the multi-year conversion schedule.

── Algorithm overview ───────────────────────────────────────────────────────

Backward induction over the timeline with state (trad_balance, roth_balance).

At each year t, for each (trad_i, roth_j) state, the search evaluates every
reachable conversion amount and keeps the one with the highest plan value from
that year on. Bellman's optimality principle makes the result globally optimal
over the discretised state space: no heuristic, no local optima, no dependence
on a starting point.

Each year follows the cash rule in ``app.engine.cashflow``, applied to every
conversion option at once: the withdrawal that leaves the household its budget
after tax is looked up in the year's withdrawal table (``Plan.table``), and tax
paid from income, premium credits and Medicare surcharges are carried at the
investment return like the balances. The state stays two balances because that
withdrawal depends only on the year and the conversion, not on history.

The search proposes a schedule; its value is always the exact walk
(``calculate_npv``), and ``optimizer.optimize`` checks the proposal against the
bracket-fill curve valued the same way.

── Precision ────────────────────────────────────────────────────────────────

Each year's conversion falls on the traditional grid. In the range
[0, initial_balance] the fine part of the grid has about G_T × 0.8 points, a
spacing of roughly $8.75k for a $1.4M balance at G_T=200, so a year's conversion
is within about half a step of the continuous optimum. The Roth grid (G_R=150)
is coarser; the value is smooth in the Roth balance, so that costs less.

Two things the state does not carry are approximated, and corrected afterwards
by the exact walk: penalty-free Roth money before 59½ (the search uses the
no-conversion schedule's draws and credits each conversion with the penalty it
avoids five years on, ``_ladder_credit``), and nothing else.

── Performance ──────────────────────────────────────────────────────────────

The outer Python loop is over traditional states (G_T per year); numpy
vectorises over Roth states × conversion options. In a working year without an
RMD nothing depends on the balance, so that year's cash per conversion and its
Roth interpolation indices are computed once for the whole grid.
"""

from dataclasses import dataclass

import numpy as np

from app.engine.aca import vectorized_aca_subsidy
from app.engine.cashflow import Plan, YearRule, plan_for
from app.engine.constants import round_to_resolution
from app.engine.early_withdrawal import CONVERSION_SEASONING_YEARS
from app.engine.irmaa import IRMAA_LOOKBACK_YEARS, vectorized_irmaa
from app.engine.rmd import vectorized_rmd
from app.engine.types import ScenarioInput


@dataclass
class DPResult:
    """Output from the DP optimizer."""

    yearly_conversions: list[float]
    total_conversion: float
    npv: float


def _year_cash(
    plan: Plan,
    rule: YearRule,
    rmd,
    conversion: np.ndarray,
    cap,
    free: float = 0.0,
):
    """One year of cash for an array of conversions, as ``Plan.step`` does it for one.

    ``cap`` is the traditional money left after the RMD and conversion, and ``free``
    the penalty-free Roth money available for spending. Returns the traditional
    withdrawal, what is wanted from Roth, the after-tax spending that still needs
    covering per dollar of Roth short (the keep rate), cash that ends the year
    outside the accounts, and the income the year is taxed on.
    """
    base = rule.income + rmd + conversion
    if rule.budget is None:
        tax_base = rule.tax.total(base)
        outside = rmd - (tax_base - rule.tax_on_income)
        return np.zeros_like(base), np.zeros_like(base), 1.0, outside, base

    grid, table = plan.grid, plan.table(rule)
    keep = 1 - rule.penalty_rate
    kept_base = np.interp(base, grid, table)
    tax_base = keep * base - kept_base
    need = rule.budget + tax_base - rule.income - rmd
    outside = np.maximum(0.0, -need)
    need = np.maximum(0.0, need)
    from_free = np.minimum(free, need)
    need = need - from_free
    draw = np.clip(np.interp(need + kept_base, table, grid) - base, 0.0, cap)
    covered = np.interp(base + draw, grid, table) - kept_base
    from_roth = from_free + np.maximum(0.0, need - covered) / keep
    return draw, from_roth, keep, outside, base + draw


def _cash_value(plan: Plan, rule: YearRule, outside, taxed_income) -> np.ndarray:
    """Today's value of a year's cash outside the accounts, with the premium credit
    and Medicare surcharge its taxed income brings."""
    value = (rule.from_accounts + outside) * plan.discount(rule.index)
    hc = plan.scenario.healthcare
    if rule.aca and hc is not None:
        value = value + plan.discount(rule.index) * vectorized_aca_subsidy(
            taxed_income, hc.household_size, hc.monthly_slcsp_premium
        )
    if rule.tax.medicare_people > 0:
        value = value - plan.discount(rule.index + IRMAA_LOOKBACK_YEARS) * vectorized_irmaa(
            rule.tax.agi(taxed_income),
            plan.scenario.filing_status,
            rule.tax.irmaa_scale,
            rule.tax.medicare_people,
        )
    return value


def _post_timeline_values(plan: Plan, trad: np.ndarray, roth: np.ndarray) -> np.ndarray:
    """Today's value of everything after the timeline, for each pair of balances at
    the end of it: the years of growth before withdrawals start, the years of
    spending from the accounts, and what is left at the planning horizon."""
    g = plan.growth
    trad = np.array(trad, dtype=float)
    roth = np.array(roth, dtype=float)
    value = np.zeros_like(trad)
    zero = np.zeros_like(trad)

    for rule in plan.years[plan.n_timeline :]:
        if not rule.growth_only:
            rmd = np.minimum(vectorized_rmd(trad, rule.age), trad) if rule.rmd_age else zero
            draw, from_roth, keep, outside, taxed = _year_cash(plan, rule, rmd, zero, trad - rmd)
            roth_draw = np.minimum(from_roth, roth)
            outside = outside - keep * (from_roth - roth_draw)
            value += _cash_value(plan, rule, outside, taxed)
            trad = trad - rmd - draw
            roth = roth - roth_draw
        trad *= 1 + g
        roth *= 1 + g

    left = np.maximum(0.0, trad) * (1 - plan.terminal_rate) + np.maximum(0.0, roth)
    return value + left * plan.discount(len(plan.years))


def _ladder_credit(plan: Plan) -> list[tuple[float, float] | None]:
    """Per year, today's value of the penalty a converted dollar avoids five years
    on, and how many dollars can avoid it: spending then that would otherwise come
    out of the accounts with the penalty. None where a conversion avoids nothing."""
    n_years = plan.n_timeline
    penalized = [flow.trad_draw + flow.roth_draw for flow in plan.no_conversion.timeline()]
    credits: list[tuple[float, float] | None] = [None] * n_years
    for t in range(n_years - CONVERSION_SEASONING_YEARS):
        later = t + CONVERSION_SEASONING_YEARS
        rate = plan.years[later].penalty_rate * plan.discount(later)
        if penalized[later] > 0 and rate > 0:
            credits[t] = (rate, penalized[later])
    return credits


def _extended_trad_grid(scenario: ScenarioInput, trad_grid: np.ndarray) -> np.ndarray:
    """The traditional grid, extended for growth: fine up to today's balance (where
    conversions land) and coarser above it."""
    n_years = len(scenario.timeline)
    g = scenario.real_growth_rate
    initial_balance = scenario.traditional_ira_balance
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)

    # The balance peaks at the drawdown-start year, before withdrawals reduce it
    max_grown_balance = initial_balance * (1 + g) ** min(n_years, years_until_drawdown)
    if max_grown_balance <= 0:
        max_grown_balance = initial_balance
    size = len(trad_grid)
    if max_grown_balance > initial_balance * 1.5 and size > 20:
        n_fine = int(size * 0.8)
        fine_part = np.linspace(0, initial_balance, n_fine, endpoint=False)
        coarse_part = np.linspace(initial_balance, max_grown_balance, size - n_fine)
        return np.concatenate([fine_part, coarse_part])
    return np.linspace(0, max_grown_balance, size)


def _dp_backward_2d(
    scenario: ScenarioInput,
    trad_grid: np.ndarray,
    roth_grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """2D backward induction: state = (trad_balance, roth_balance).

    The roth grid must be uniform to enable O(1) index arithmetic in the
    hot inner loop (avoiding per-element searchsorted).

    Before 59½ spending draws on penalty-free Roth money first (see
    ``early_withdrawal``). How much of it there is depends on history the state
    doesn't carry, so each year uses the no-conversion schedule's draw, and each
    conversion is credited with the penalty it avoids five years on
    (``_ladder_credit``).

    Returns:
        value_table:  (n_years+1, G_T, G_R), today's value from each year on.
        policy_table: (n_years,   G_T, G_R), optimal conversion grid index.
        extended_trad: (G_T,) non-uniform trad grid (extended for growth).
        roth_grid: (G_R,) uniform roth grid (unchanged from input).
    """
    plan = plan_for(scenario)
    n_years = plan.n_timeline
    g = plan.growth
    free_draws = [flow.roth_free for flow in plan.no_conversion.timeline()]
    ladder = _ladder_credit(plan)

    extended_trad = _extended_trad_grid(plan.scenario, trad_grid)
    G_T = len(extended_trad)
    G_R = len(roth_grid)

    # Roth grid spacing, for O(1) fractional index arithmetic
    d_roth = (roth_grid[-1] - roth_grid[0]) / max(G_R - 1, 1)

    value_table = np.zeros((n_years + 1, G_T, G_R))
    value_table[n_years] = _post_timeline_values(
        plan,
        np.repeat(extended_trad, G_R),
        np.tile(roth_grid, G_T),
    ).reshape(G_T, G_R)
    policy_table = np.zeros((n_years, G_T, G_R), dtype=np.int64)

    scaled_roth = roth_grid * (1 + g)  # (G_R,)

    for t in range(n_years - 1, -1, -1):
        rule = plan.years[t]
        future_ref = value_table[t + 1]  # (G_T, G_R)
        free_t = free_draws[t]
        rmd_arr = (
            np.minimum(vectorized_rmd(extended_trad, rule.age), extended_trad)
            if rule.rmd_age
            else None
        )

        # A working year without an RMD: the year's cash depends on the conversion
        # alone, and nothing is drawn from Roth, so both are computed once
        same_for_every_balance = rule.budget is None and rmd_arr is None
        if same_for_every_balance:
            _, _, _, outside, taxed = _year_cash(plan, rule, 0.0, extended_trad, 0.0)
            cash_row = _cash_value(plan, rule, outside, taxed)
            # next_roth[k, j] = (conversion[k] + roth[j]) * (1 + g)
            roth_frac_pre = (
                extended_trad[:, np.newaxis] * (1 + g) + scaled_roth[np.newaxis, :] - roth_grid[0]
            ) / d_roth  # (G_T, G_R)
            roth_lo_pre = np.clip(np.floor(roth_frac_pre).astype(np.int64), 0, G_R - 2)
            frac_r_pre = np.clip(roth_frac_pre - roth_lo_pre, 0.0, 1.0)

        for i in range(G_T):
            available = extended_trad[i]
            rmd_i = float(rmd_arr[i]) if rmd_arr is not None else 0.0
            available_for_conv = available - rmd_i

            n_opts = int(np.searchsorted(extended_trad, available_for_conv + 1e-9, side="right"))
            n_opts = max(1, min(n_opts, i + 1))
            conv_options = extended_trad[:n_opts]  # (n_opts,)
            left_after_conv = np.maximum(0.0, available_for_conv - conv_options)

            if same_for_every_balance:
                gain = cash_row[:n_opts]
                next_trad = left_after_conv * (1 + g)
                roth_lo = roth_lo_pre[:n_opts]  # zero-copy slices
                frac_r = frac_r_pre[:n_opts]
                short_cost = 0.0
            else:
                draw, from_roth, keep, outside, taxed = _year_cash(
                    plan, rule, rmd_i, conv_options, left_after_conv, free_t
                )
                gain = _cash_value(plan, rule, outside, taxed)
                next_trad = (left_after_conv - draw) * (1 + g)

                # Roth after the conversion and the year's draws. What it cannot
                # cover is spending the household goes without.
                roth_after = (conv_options - from_roth)[:, np.newaxis] + roth_grid[np.newaxis, :]
                short_cost = plan.discount(t) * keep * np.maximum(0.0, -roth_after)  # (n_opts, G_R)
                next_roth = np.clip(roth_after * (1 + g), 0.0, roth_grid[-1])
                roth_frac_idx = (next_roth - roth_grid[0]) / d_roth
                roth_lo = np.clip(np.floor(roth_frac_idx).astype(np.int64), 0, G_R - 2)
                frac_r = np.clip(roth_frac_idx - roth_lo, 0.0, 1.0)

            if ladder[t] is not None:
                rate, cap = ladder[t]
                gain = gain + rate * np.minimum(conv_options, cap)

            # Bilinear interpolation of future_ref at (next_trad[k], next_roth[k, j])
            trad_lo = np.clip(
                np.searchsorted(extended_trad, next_trad, side="right") - 1, 0, G_T - 2
            )
            trad_spans = extended_trad[trad_lo + 1] - extended_trad[trad_lo]
            frac_t = np.clip(
                np.where(trad_spans > 0, (next_trad - extended_trad[trad_lo]) / trad_spans, 0.0),
                0.0,
                1.0,
            )  # (n_opts,)
            future_lo_t = future_ref[trad_lo, :]
            future_at_trad = future_lo_t + frac_t[:, np.newaxis] * (
                future_ref[trad_lo + 1, :] - future_lo_t
            )  # (n_opts, G_R)

            # take_along_axis is the efficient row-wise gather here
            future_lo_r = np.take_along_axis(future_at_trad, roth_lo, axis=1)
            future_hi_r = np.take_along_axis(future_at_trad, roth_lo + 1, axis=1)
            future_bilinear = future_lo_r + frac_r * (future_hi_r - future_lo_r)

            values = gain[:, np.newaxis] - short_cost + future_bilinear  # (n_opts, G_R)
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
    """Read the schedule off the policy by walking the real balances forward."""
    plan = plan_for(scenario)
    G_R = len(roth_grid)
    d_roth = (roth_grid[-1] - roth_grid[0]) / max(G_R - 1, 1)
    conversions: list[float] = []

    trad = float(plan.scenario.traditional_ira_balance)
    roth = float(plan.scenario.roth_ira_balance)
    basis = roth
    taken: list[float] = []

    for t in range(plan.n_timeline):
        if t >= CONVERSION_SEASONING_YEARS:
            basis += taken[t - CONVERSION_SEASONING_YEARS]

        # Snap to nearest grid indices
        trad_idx = max(
            0,
            min(
                int(np.searchsorted(extended_trad, trad, side="right") - 1),
                len(extended_trad) - 1,
            ),
        )
        roth_raw = (roth - roth_grid[0]) / d_roth if d_roth > 0 else 0.0
        roth_idx = max(0, min(int(round(roth_raw)), G_R - 1))

        conversion = float(extended_trad[int(policy_table[t, trad_idx, roth_idx])])
        flow, basis = plan.step(plan.years[t], trad, roth, basis, conversion)
        taken.append(flow.conversion)
        conversions.append(round_to_resolution(flow.conversion))
        trad, roth = flow.trad_end, flow.roth_end

    return conversions


def dp_optimize(
    scenario: ScenarioInput,
    trad_grid_size: int = 200,
    roth_grid_size: int = 150,
) -> DPResult:
    """2D DP optimizer: state = (trad_balance, roth_balance).

    Single pass. ``optimizer.optimize()`` calls ``_finalize_conversions``
    afterward for $100 display precision.
    """
    from app.engine.optimizer import calculate_npv

    balance = scenario.traditional_ira_balance
    n_years = len(scenario.timeline)

    if balance <= 0 or n_years == 0:
        npv = calculate_npv(scenario, [0.0] * n_years) if n_years > 0 else 0.0
        return DPResult(
            yearly_conversions=[0.0] * n_years,
            total_conversion=0.0,
            npv=npv,
        )

    g = scenario.real_growth_rate

    # Trad input grid, extended in _dp_backward_2d for growth
    trad_grid = np.linspace(0, balance, trad_grid_size)

    # Roth grid: uniform, sized to cover the maximum possible roth at timeline end
    max_roth = (scenario.roth_ira_balance + balance) * (1 + g) ** n_years * 1.1
    max_roth = max(max_roth, scenario.roth_ira_balance * 1.1, 1.0)
    roth_grid = np.linspace(0, max_roth, roth_grid_size)

    _, policy, ext_trad, r_grid = _dp_backward_2d(scenario, trad_grid, roth_grid)
    conversions = _forward_pass_2d(scenario, ext_trad, r_grid, policy)

    return DPResult(
        yearly_conversions=conversions,
        total_conversion=sum(conversions),
        npv=calculate_npv(scenario, conversions),
    )
