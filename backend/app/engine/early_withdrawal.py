"""Withdrawals before age 59½.

Before 59½, money taken from a traditional account for spending pays a 10%
additional tax on top of income tax (IRC 72(t)). Conversions themselves are
never penalized. Roth money comes out in the IRS ordering: contributions first,
then conversions oldest first, then earnings. Contributions are always
penalty-free, and each conversion is penalty-free once five tax years have
passed (the clock starts January 1 of the conversion year). The existing Roth
balance is treated as contributions.

So before 59½ the engine funds spending from penalty-free Roth money first,
then the traditional account with the penalty, then any other Roth money, also
with the penalty. The year 59½ is reached pays the penalty on the months before
it: the engine works in whole years, so the year is split by birth month.

Not modeled: the rule of 55 and 72(t) payments, which depend on which dollars
sit in which employer plan, and income tax on Roth earnings withdrawn early.
"""

from app.engine.rmd import calculate_rmd, rmd_start_age
from app.engine.types import ScenarioInput

EARLY_WITHDRAWAL_PENALTY = 0.10
CONVERSION_SEASONING_YEARS = 5

__all__ = [
    "CONVERSION_SEASONING_YEARS",
    "EARLY_WITHDRAWAL_PENALTY",
    "age_59_half",
    "early_fraction",
    "early_penalty",
    "has_early_spending",
    "penalty_free_draws",
]


def age_59_half(scenario: ScenarioInput) -> tuple[int, int]:
    """Calendar year and month (1-12) the owner reaches 59½.

    Born January to June, it is the year they turn 59; July to December, the year
    they turn 60. Without a birth month, assume midway through the year they turn 59.
    """
    birth_year = scenario.timeline[0].year - scenario.age
    month = scenario.birth_month
    if month is None:
        return birth_year + 59, 7
    if month <= 6:
        return birth_year + 59, month + 6
    return birth_year + 60, month - 6


def early_fraction(scenario: ScenarioInput, t: int) -> float:
    """Share of plan year ``t`` before the owner reaches 59½ (0 to 1)."""
    year, month = age_59_half(scenario)
    calendar_year = scenario.timeline[0].year + t
    if calendar_year < year:
        return 1.0
    if calendar_year == year:
        return (month - 1) / 12
    return 0.0


def early_penalty(scenario: ScenarioInput, t: int, penalized: float) -> float:
    """Additional tax on ``penalized`` spending (traditional and non-free Roth draws)."""
    if penalized <= 0:
        return 0.0
    return EARLY_WITHDRAWAL_PENALTY * early_fraction(scenario, t) * penalized


def has_early_spending(scenario: ScenarioInput) -> bool:
    """Whether any timeline year funds spending from the accounts before 59½."""
    return any(
        entry.drawdown and early_fraction(scenario, t) > 0
        for t, entry in enumerate(scenario.timeline)
    )


def penalty_free_draws(scenario: ScenarioInput, conversions: list[float]) -> list[float]:
    """Spending drawn from penalty-free Roth money in each timeline year.

    Walks the accounts the way every engine path does (RMD, conversion, spending
    draw, then growth) with the penalty-free Roth money drawn first in years
    before 59½. Every walker takes these amounts out of the year's spending need
    before drawing on the traditional account, so all paths agree.
    """
    n_years = len(scenario.timeline)
    if not has_early_spending(scenario):
        return [0.0] * n_years

    g = scenario.real_growth_rate
    owner_rmd_start = rmd_start_age(scenario.age, scenario.timeline[0].year)
    trad = scenario.traditional_ira_balance
    roth = scenario.roth_ira_balance
    # Penalty-free money not yet withdrawn: contributions, then seasoned conversions
    basis = scenario.roth_ira_balance
    converted = [0.0] * n_years
    draws = []
    for t, entry in enumerate(scenario.timeline):
        owner_age = scenario.age + t
        if t >= CONVERSION_SEASONING_YEARS:
            basis += converted[t - CONVERSION_SEASONING_YEARS]
        rmd = calculate_rmd(trad, owner_age) if owner_age >= owner_rmd_start else 0.0
        rmd = min(rmd, trad)
        available = trad - rmd
        conversion = min(max(0.0, conversions[t]), available)
        converted[t] = conversion
        need = max(0.0, (entry.drawdown or 0.0) - rmd)

        free = 0.0
        if need > 0 and early_fraction(scenario, t) > 0:
            free = max(0.0, min(need, basis, roth))
            basis -= free
        draws.append(free)

        trad_draw = min(need - free, available - conversion)
        trad -= rmd + conversion + trad_draw
        roth += conversion
        roth -= min(need - trad_draw, roth)
        trad *= 1 + g
        roth *= 1 + g
    return draws
