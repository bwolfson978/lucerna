"""Rules for the years after the timeline, and for states in retirement.

After the timeline ends (or at ``drawdown_start_age`` if that is later), the
engine funds spending from the accounts until ``planning_horizon_age``, with no
other income and no conversions. Each of those years runs through the same year
step as a timeline year (``app.engine.cashflow``). The traditional balance left at
the planning horizon is valued at the household's marginal rate in the final plan
year (``terminal_tax_rate``).
"""

from app.engine.types import ScenarioInput
from app.engine.year_tax import YearTax


def post_timeline_start(scenario: ScenarioInput) -> int:
    """Year offset (from today) of the first post-timeline drawdown year."""
    years_until_drawdown = max(0, scenario.drawdown_start_age - scenario.age)
    return max(len(scenario.timeline), years_until_drawdown)


def post_timeline_tax(scenario: ScenarioInput, t: float = 0) -> YearTax:
    """Tax in plan year ``t`` after the timeline: federal and retirement-state tax on
    account withdrawals, with no other income. The state's retirement exclusion is
    taken at the age the phase starts."""
    return YearTax(
        filing_status=scenario.filing_status,
        state=scenario.retirement_state or scenario.state,
        custom_state_rate=scenario.custom_state_rate,
        fixed_scale=scenario.fixed_dollar_scale(t),
        other_income=0.0,
        age=scenario.age + post_timeline_start(scenario),
    )


def withdrawal_tax(scenario: ScenarioInput, amount: float, t: float = 0) -> float:
    """Federal and retirement-state tax on an account withdrawal in plan year ``t``."""
    return float(post_timeline_tax(scenario, t).total(amount))


def terminal_tax_rate(scenario: ScenarioInput) -> float:
    """Combined federal and state marginal rate in the final plan year.

    Measured on the next $1,000 of income on top of that year's income without
    any conversions: Social Security, pensions and other income, the RMD and the
    traditional withdrawal for spending. It is fixed for the scenario, so every
    conversion schedule values its leftover balance at the same rate.
    """
    from app.engine.cashflow import plan_for  # lazy: cashflow builds on this module

    return plan_for(scenario).terminal_rate


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
    if not any(
        entry.state is None and t >= start_offset for t, entry in enumerate(scenario.timeline)
    ):
        return scenario
    timeline = [
        entry.model_copy(update={"state": ret_state})
        if entry.state is None and t >= start_offset
        else entry
        for t, entry in enumerate(scenario.timeline)
    ]
    return scenario.model_copy(update={"timeline": timeline})


def conversion_bases(scenario: ScenarioInput, conversions: list[float]) -> list[float]:
    """Each timeline year's income before its conversion: income, RMD and the
    traditional withdrawal that funds spending and tax. The conversion is the top
    slice of what the year is taxed on."""
    from app.engine.cashflow import walk  # lazy: cashflow builds on this module

    return [flow.base_income for flow in walk(scenario, conversions).timeline()]
