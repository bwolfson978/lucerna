"""Inflation: the engine works in today's dollars.

Every amount in a ``ScenarioInput`` (income, spending, balances) is in today's
dollars and every result comes back in them. The investment return and the
discount rate are entered as usually quoted, before inflation, and turned into
real rates here.

Most tax thresholds rise with inflation by law (federal brackets, the standard
deduction, IRMAA tiers, the poverty line), so in today's dollars they keep
their 2026 values every year. A few are fixed in law and lose value as prices
rise: the Social Security taxation thresholds and the brackets of states that
don't index them. Those shrink by ``fixed_dollar_scale`` each year. This gives
the same answer as running in future dollars with indexed thresholds rising,
then converting back to today's dollars.
"""

__all__ = ["real_rate", "fixed_dollar_scale", "nominal_scale"]


def real_rate(nominal: float, inflation: float) -> float:
    """Rate after inflation, e.g. a 7% return with 2.5% inflation grows 4.4% a year."""
    if not inflation:
        return nominal  # exactly, so a plan without inflation is unchanged
    return (1 + nominal) / (1 + inflation) - 1


def fixed_dollar_scale(inflation: float, years: float) -> float:
    """Today's value of a dollar amount fixed in law, ``years`` from now."""
    return (1 + inflation) ** -years


def nominal_scale(inflation: float, years: float) -> float:
    """Future dollars per today's dollar, ``years`` from now."""
    return (1 + inflation) ** years
