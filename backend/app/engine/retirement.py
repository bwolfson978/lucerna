"""Rules for the post-timeline retirement phase, shared by every engine path.

After the timeline ends (or at ``drawdown_start_age`` if that is later), the
engine funds spending from the accounts until ``planning_horizon_age``. Each
year runs in the same order as a timeline year: RMD and withdrawal on the
start-of-year balance, then growth. Social Security and pensions
(``retirement_income``) cover part of the spending and are taxed first, so
account withdrawals stack on top of them.
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
    """Yearly amount the accounts must fund after the timeline.

    With explicit spending, Social Security and pensions cover their share
    first. Without it, the 4% rule applies to the account balance at the start
    of the phase (a withdrawal rate, so other income doesn't reduce it).
    Accepts a float or a numpy array of balances.
    """
    if scenario.default_drawdown is None:
        return account_balance * RETIREMENT_SPENDING_RATE
    need = max(0.0, scenario.default_drawdown - scenario.retirement_income)
    if isinstance(account_balance, np.ndarray):
        return np.full_like(account_balance, need)
    return need


def withdrawal_tax(scenario: ScenarioInput, amount: float) -> float:
    """Tax on an account withdrawal stacked on top of retirement income."""
    other = scenario.retirement_income
    fs = scenario.filing_status
    tax = calculate_federal_tax(other + amount, fs) - calculate_federal_tax(other, fs)
    state = scenario.retirement_state or scenario.state
    if state:
        rate = scenario.custom_state_rate
        tax += calculate_state_tax(other + amount, state, fs, rate) - calculate_state_tax(
            other, state, fs, rate
        )
    return tax


def vectorized_withdrawal_tax(scenario: ScenarioInput, amounts: np.ndarray) -> np.ndarray:
    """Vectorized ``withdrawal_tax``."""
    other = scenario.retirement_income
    fs = scenario.filing_status
    tax = vectorized_federal_tax(other + amounts, fs) - calculate_federal_tax(other, fs)
    state = scenario.retirement_state or scenario.state
    if state:
        rate = scenario.custom_state_rate
        tax = (
            tax
            + vectorized_state_tax(other + amounts, state, fs, rate)
            - calculate_state_tax(other, state, fs, rate)
        )
    return tax


def retirement_taxable_income(scenario: ScenarioInput, account_balance: float) -> float:
    """Rough taxable income in a typical retirement year, for marginal rate estimates."""
    return scenario.retirement_income + account_spending(scenario, account_balance)
