"""Rules for the post-timeline retirement phase, shared by every engine path.

After the timeline ends (or at ``drawdown_start_age`` if that is later), the
engine funds spending from the accounts until ``planning_horizon_age``. Each
year runs in the same order as a timeline year: RMD and withdrawal on the
start-of-year balance, then growth. The traditional balance left at the
planning horizon is valued at the household's marginal rate in the final plan
year (see ``terminal_value``).
"""

import numpy as np

from app.engine.constants import RETIREMENT_SPENDING_RATE
from app.engine.state_tax import (
    calculate_state_tax,
    retirement_exclusion,
    vectorized_state_tax,
)
from app.engine.tax import calculate_federal_tax, vectorized_federal_tax
from app.engine.types import ScenarioInput
from app.engine.year_tax import year_tax

# Step used to measure the marginal rate: tax on the next $1,000 of income
_MARGINAL_STEP = 1_000.0


def post_timeline_start(scenario: ScenarioInput) -> int:
    """Year offset (from today) of the first post-timeline drawdown year."""
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    return max(len(scenario.timeline), years_until_drawdown)


def account_spending(scenario: ScenarioInput, account_balance):
    """Yearly amount the accounts fund after the timeline.

    Explicit spending if set, otherwise the 4% rule on the account balance at
    the start of the phase. Accepts a float or a numpy array of balances.
    """
    if scenario.default_drawdown is None:
        return account_balance * RETIREMENT_SPENDING_RATE
    if isinstance(account_balance, np.ndarray):
        return np.full_like(account_balance, scenario.default_drawdown)
    return scenario.default_drawdown


def _state_taxed_withdrawal(scenario: ScenarioInput, state: str, amount, t: float = 0):
    """The part of a post-timeline withdrawal the retirement state taxes."""
    age = scenario.age + post_timeline_start(scenario)
    return amount - retirement_exclusion(
        state, scenario.filing_status, age, amount, amount, scenario.fixed_dollar_scale(t)
    )


def withdrawal_tax(scenario: ScenarioInput, amount: float, t: float = 0) -> float:
    """Federal and retirement-state tax on an account withdrawal in plan year ``t``."""
    tax = calculate_federal_tax(amount, scenario.filing_status)
    state = scenario.retirement_state or scenario.state
    if state:
        tax += calculate_state_tax(
            _state_taxed_withdrawal(scenario, state, amount, t),
            state,
            scenario.filing_status,
            scenario.custom_state_rate,
            scenario.fixed_dollar_scale(t),
        )
    return tax


def vectorized_withdrawal_tax(
    scenario: ScenarioInput, amounts: np.ndarray, t: float = 0
) -> np.ndarray:
    """Vectorized ``withdrawal_tax``."""
    tax = vectorized_federal_tax(amounts, scenario.filing_status)
    state = scenario.retirement_state or scenario.state
    if state:
        tax = tax + vectorized_state_tax(
            _state_taxed_withdrawal(scenario, state, amounts, t),
            state,
            scenario.filing_status,
            scenario.custom_state_rate,
            scenario.fixed_dollar_scale(t),
        )
    return tax


def terminal_tax_rate(scenario: ScenarioInput) -> float:
    """Combined federal and state marginal rate in the final plan year.

    Measured on the next $1,000 of income on top of that year's income without
    any conversions: Social Security, pensions and other income, the RMD and the
    traditional withdrawal for spending. It is fixed for the scenario, so every
    conversion schedule values its leftover balance at the same rate.
    """
    cached = _rate_cache.get(id(scenario))
    if cached is not None and cached[0] is scenario:
        return cached[1]

    from app.engine.early_withdrawal import penalty_free_draws
    from app.engine.rmd import calculate_rmd, rmd_start_age

    n_years = len(scenario.timeline)
    last_year = scenario.planning_horizon_age - scenario.age
    phase3_start = post_timeline_start(scenario)

    if phase3_start > last_year:
        # The final plan year is a timeline year
        income = conversion_bases(scenario, [0.0] * n_years)[-1]
        yt = year_tax(scenario, n_years - 1)
        rate = (yt.total(income + _MARGINAL_STEP) - yt.total(income)) / _MARGINAL_STEP
    else:
        # The final plan year is in the post-timeline phase: walk there without conversions
        g = scenario.real_growth_rate
        owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
        trad = scenario.traditional_ira_balance
        roth = scenario.roth_ira_balance
        free_draws = penalty_free_draws(scenario, [0.0] * n_years)
        for t, entry in enumerate(scenario.timeline):
            owner_age = scenario.age + t
            rmd = calculate_rmd(trad, owner_age) if owner_age >= owner_rmd_start else 0.0
            rmd = min(rmd, trad)
            need = draw_beyond_rmd(entry.drawdown, rmd)
            trad_draw = min(need - free_draws[t], trad - rmd)
            trad -= rmd + trad_draw
            roth -= min(need - trad_draw, roth)
            trad *= 1 + g
            roth *= 1 + g
        extra_growth = phase3_start - n_years
        if extra_growth > 0:
            trad *= (1 + g) ** extra_growth
            roth *= (1 + g) ** extra_growth
        spending = account_spending(scenario, trad + roth)
        distribution = 0.0
        for year in range(phase3_start, last_year + 1):
            owner_age = scenario.age + year
            rmd = calculate_rmd(trad, owner_age) if owner_age >= owner_rmd_start else 0.0
            distribution = min(max(rmd, min(spending, trad)), trad)
            trad -= distribution
            roth -= min(max(0.0, spending - distribution), roth)
            trad *= 1 + g
            roth *= 1 + g
        rate = (
            withdrawal_tax(scenario, distribution + _MARGINAL_STEP, last_year)
            - withdrawal_tax(scenario, distribution, last_year)
        ) / _MARGINAL_STEP

    rate = min(max(float(rate), 0.0), 0.99)
    if len(_rate_cache) >= 64:
        _rate_cache.pop(next(iter(_rate_cache)))
    _rate_cache[id(scenario)] = (scenario, rate)
    return rate


# Scenario id -> (scenario, rate). Holding the scenario keeps its id from being reused.
_rate_cache: dict[int, tuple[ScenarioInput, float]] = {}


def terminal_value(scenario: ScenarioInput, trad: float, roth: float, year: int) -> float:
    """Today's value of the balances left at the planning horizon, in plan ``year``.

    The traditional balance is worth ``1 - terminal_tax_rate`` per dollar, the
    household's marginal rate in the final plan year, rather than being taxed as
    one large single-year withdrawal. The Roth balance is tax-free.
    """
    after_tax = max(0.0, trad) * (1 - terminal_tax_rate(scenario)) + max(0.0, roth)
    return after_tax * (1 + scenario.real_discount_rate) ** (-year)


def vectorized_terminal_value(
    scenario: ScenarioInput, trad: np.ndarray, roth: np.ndarray, year: int
) -> np.ndarray:
    """Vectorized ``terminal_value``."""
    after_tax = np.maximum(0.0, trad) * (1 - terminal_tax_rate(scenario)) + np.maximum(0.0, roth)
    return after_tax * (1 + scenario.real_discount_rate) ** (-year)


def draw_beyond_rmd(drawdown: float | None, rmd: float) -> float:
    """Spending still to fund after the year's RMD, which counts toward it."""
    if not drawdown:
        return 0.0
    return max(0.0, drawdown - rmd)


def resolve_states(scenario: ScenarioInput) -> ScenarioInput:
    """Tax timeline years from ``drawdown_start_age`` on in the retirement state.

    The timeline runs to the plan's last year, so retirement years are timeline
    years. A year with its own state override keeps it; the rest move to
    ``retirement_state`` once drawdowns start.
    """
    ret_state = scenario.retirement_state
    if ret_state is None or ret_state == scenario.state:
        return scenario
    start_offset = scenario.drawdown_start_age - scenario.age
    timeline = [
        entry.model_copy(update={"state": ret_state})
        if entry.state is None and t >= start_offset
        else entry
        for t, entry in enumerate(scenario.timeline)
    ]
    return scenario.model_copy(update={"timeline": timeline})


def conversion_magi(income_with_rmd, available_for_conv, need, conversion):
    """Income before a conversion and the income the conversion adds, counting the
    traditional withdrawal that funds spending.

    Spending beyond the RMD is drawn from the traditional account first and Roth
    covers any shortfall, so the year's traditional outflow is
    ``min(available_for_conv, conversion + need)``. The base is that outflow
    without a conversion. ACA subsidies, IRMAA and the conversion's own tax and
    bracket are all measured from this base. Works on floats or numpy arrays.
    """
    drawn_anyway = np.minimum(need, available_for_conv)
    base = income_with_rmd + drawn_anyway
    added = np.minimum(available_for_conv, conversion + need) - drawn_anyway
    return base, added


def conversion_bases(scenario: ScenarioInput, conversions: list[float]) -> list[float]:
    """Each timeline year's income before its conversion: income, RMD and the
    traditional withdrawal for spending (see ``conversion_magi``).

    Walks the balance the way the optimizer does: RMD, conversion and spending
    draw, then growth.
    """
    from app.engine.early_withdrawal import penalty_free_draws
    from app.engine.rmd import calculate_rmd, rmd_start_age

    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    free_draws = penalty_free_draws(scenario, conversions)
    balance = scenario.traditional_ira_balance
    bases = []
    for t, entry in enumerate(scenario.timeline):
        owner_age = scenario.age + t
        rmd = calculate_rmd(balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, balance)
        available = balance - rmd
        conversion = min(max(0.0, conversions[t]), available)
        need = draw_beyond_rmd(entry.drawdown, rmd) - free_draws[t]
        base, _ = conversion_magi(entry.gross_income + rmd, available, need, conversion)
        bases.append(float(base))
        balance = (available - conversion - min(need, available - conversion)) * (
            1 + scenario.real_growth_rate
        )
    return bases


def resolve_drawdowns(scenario: ScenarioInput) -> ScenarioInput:
    """Fill in spending draws for timeline years once drawdowns have started.

    A timeline year at or after ``drawdown_start_age`` with no explicit
    ``drawdown`` funds the household's spending from the accounts: explicit
    spending less that year's income, or the 4% rule on the balance projected
    to the drawdown start. Explicit drawdowns are kept as given.
    """
    start_offset = scenario.drawdown_start_age - scenario.age
    if not any(
        entry.drawdown is None and t >= start_offset for t, entry in enumerate(scenario.timeline)
    ):
        return scenario

    if scenario.default_drawdown is None:
        projected = (scenario.traditional_ira_balance + scenario.roth_ira_balance) * (
            1 + scenario.real_growth_rate
        ) ** max(0, start_offset)
        four_percent = projected * RETIREMENT_SPENDING_RATE

    timeline = []
    for t, entry in enumerate(scenario.timeline):
        if entry.drawdown is None and t >= start_offset:
            if scenario.default_drawdown is None:
                need = four_percent
            else:
                need = max(0.0, scenario.default_drawdown - entry.gross_income)
            entry = entry.model_copy(update={"drawdown": round(need, 2)})
        timeline.append(entry)
    return scenario.model_copy(update={"timeline": timeline})
