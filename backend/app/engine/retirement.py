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
