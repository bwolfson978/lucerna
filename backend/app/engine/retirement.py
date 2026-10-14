"""Rules for the post-timeline retirement phase, shared by every engine path.

After the timeline ends (or at ``drawdown_start_age`` if that is later), the
engine funds spending from the accounts until ``planning_horizon_age``. Each
year runs in the same order as a timeline year: RMD and withdrawal on the
start-of-year balance, then growth.
"""

import numpy as np

from app.engine.constants import RETIREMENT_SPENDING_RATE
from app.engine.state_tax import calculate_state_tax, vectorized_state_tax
from app.engine.tax import calculate_federal_tax, vectorized_federal_tax
from app.engine.types import ScenarioInput


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


def withdrawal_tax(scenario: ScenarioInput, amount: float) -> float:
    """Federal and retirement-state tax on an account withdrawal."""
    tax = calculate_federal_tax(amount, scenario.filing_status)
    state = scenario.retirement_state or scenario.state
    if state:
        tax += calculate_state_tax(
            amount, state, scenario.filing_status, scenario.custom_state_rate
        )
    return tax


def vectorized_withdrawal_tax(scenario: ScenarioInput, amounts: np.ndarray) -> np.ndarray:
    """Vectorized ``withdrawal_tax``."""
    tax = vectorized_federal_tax(amounts, scenario.filing_status)
    state = scenario.retirement_state or scenario.state
    if state:
        tax = tax + vectorized_state_tax(
            amounts, state, scenario.filing_status, scenario.custom_state_rate
        )
    return tax


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
    from app.engine.rmd import calculate_rmd, rmd_start_age

    owner_rmd_start = rmd_start_age(scenario.age)
    balance = scenario.traditional_ira_balance
    bases = []
    for t, entry in enumerate(scenario.timeline):
        owner_age = scenario.age + t
        rmd = calculate_rmd(balance, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, balance)
        available = balance - rmd
        conversion = min(max(0.0, conversions[t]), available)
        need = draw_beyond_rmd(entry.drawdown, rmd)
        base, _ = conversion_magi(entry.gross_income + rmd, available, need, conversion)
        bases.append(float(base))
        balance = (available - conversion - min(need, available - conversion)) * (
            1 + scenario.annual_growth_rate
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
            1 + scenario.annual_growth_rate
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
