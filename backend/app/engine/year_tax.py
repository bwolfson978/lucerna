"""Income tax for one timeline year, with Social Security and the 65+ deductions.

Engine incomes count Social Security in full (it is part of ``gross_income``,
and ACA MAGI does include all of it). Federal tax only sees the taxable part
of the benefit, found with the IRS provisional income worksheet, and filers
65 and older get a larger standard deduction. Through 2028 they also get the
2025 law's senior deduction, which phases out with income, so a conversion
in its phase-out range adds more than itself to taxable income. Most states don't tax Social
Security at all, and some exempt part or all of IRA and 401(k) money (see
``retirement_exclusion``). ``YearTax`` maps an engine income to what each tax actually
applies to, so every caller keeps passing the same incomes it always did.
"""

from dataclasses import dataclass

import numpy as np

from app.engine.irmaa import IRMAA_LOOKBACK_YEARS, MEDICARE_START_AGE, lookback_threshold_scale
from app.engine.state_tax import (
    calculate_state_tax,
    resolve_state_for_year,
    retirement_exclusion,
    vectorized_state_tax,
)
from app.engine.tax import calculate_federal_tax, get_marginal_rate, vectorized_federal_tax
from app.engine.types import FilingStatus, ScenarioInput

# Provisional income thresholds where 50% and then 85% of benefits become taxable
SS_THRESHOLDS = {
    FilingStatus.SINGLE: (25_000, 34_000),
    FilingStatus.MFJ: (32_000, 44_000),
}

# 2026 additional standard deduction per person 65 or older
ADDITIONAL_DEDUCTION_65 = {
    FilingStatus.SINGLE: 2_050,
    FilingStatus.MFJ: 1_650,
}
SENIOR_DEDUCTION_AGE = 65

# Senior deduction from the 2025 reconciliation law (IRC 151(d)(5)(C)), tax
# years 2025 to 2028: $6,000 per person 65 or older, each cut by 6% of MAGI
# over the threshold (Schedule 1-A applies the cut to each spouse's $6,000).
# Fixed in law, not indexed. MAGI is AGI here: the foreign income it adds
# back isn't modeled.
SENIOR_BONUS_DEDUCTION = 6_000
SENIOR_BONUS_YEARS = range(2025, 2029)
SENIOR_BONUS_PHASEOUT_RATE = 0.06
SENIOR_BONUS_PHASEOUT_START = {
    FilingStatus.SINGLE: 75_000,
    FilingStatus.MFJ: 150_000,
}

# States that tax some Social Security in 2026. They have their own exemptions,
# which are not modeled: benefits are taxed in full there.
STATES_TAXING_SOCIAL_SECURITY = frozenset({"CO", "CT", "MN", "MT", "NM", "RI", "UT", "VT"})


def taxable_social_security(
    other_income, benefits: float, filing_status: FilingStatus, fixed_scale: float = 1.0
):
    """Taxable part of ``benefits`` given the year's other income (scalar or array).

    The thresholds are fixed in law, so in today's dollars they shrink by
    ``fixed_scale`` (see ``app.engine.inflation``).
    """
    if benefits <= 0:
        return np.zeros_like(other_income, dtype=float) if np.ndim(other_income) else 0.0
    low, high = (threshold * fixed_scale for threshold in SS_THRESHOLDS[filing_status])
    provisional = np.asarray(other_income, dtype=float) + 0.5 * benefits
    middle = np.minimum(0.5 * (provisional - low), 0.5 * benefits)
    upper = np.minimum(
        0.85 * benefits,
        0.85 * (provisional - high) + min(0.5 * benefits, 0.5 * (high - low)),
    )
    taxable = np.where(provisional <= low, 0.0, np.where(provisional <= high, middle, upper))
    return taxable if np.ndim(other_income) else float(taxable)


@dataclass(frozen=True)
class YearTax:
    """Federal and state income tax for one year, as a function of engine income."""

    filing_status: FilingStatus
    state: str | None = None
    custom_state_rate: float | None = None
    social_security: float = 0.0
    extra_deduction: float = 0.0
    # People who qualify for the senior deduction this year (0, 1 or 2)
    senior_bonus_people: int = 0
    # People on Medicare when this year's income sets IRMAA, two years on (0, 1 or 2)
    medicare_people: int = 0
    # Today's value of a dollar amount fixed in law this year (1.0 without inflation)
    fixed_scale: float = 1.0
    # IRMAA tiers that this year's MAGI is compared with (see ``lookback_threshold_scale``)
    irmaa_scale: float = 1.0
    # The year's income from outside the accounts (wages, pensions, benefits).
    # Engine income above it is IRA money: RMDs, withdrawals and conversions.
    other_income: float | None = None
    age: float = 0.0

    def agi(self, income):
        """Adjusted gross income: other income plus the taxable part of benefits."""
        if self.social_security <= 0:
            return income
        other = np.maximum(0.0, np.asarray(income, dtype=float) - self.social_security)
        agi = other + taxable_social_security(
            other, self.social_security, self.filing_status, self.fixed_scale
        )
        return agi if np.ndim(income) else float(agi)

    def senior_deduction(self, agi):
        """The senior deduction left after the phase-out, at ``agi`` (scalar or array)."""
        if self.senior_bonus_people <= 0:
            return np.zeros_like(agi, dtype=float) if np.ndim(agi) else 0.0
        start = SENIOR_BONUS_PHASEOUT_START[self.filing_status] * self.fixed_scale
        excess = np.maximum(0.0, np.asarray(agi, dtype=float) - start)
        each = np.maximum(
            0.0,
            SENIOR_BONUS_DEDUCTION * self.fixed_scale - SENIOR_BONUS_PHASEOUT_RATE * excess,
        )
        out = self.senior_bonus_people * each
        return out if np.ndim(agi) else float(out)

    def _federal_base(self, income):
        """The gross income federal brackets apply to (before the standard deduction)."""
        agi = self.agi(income)
        return agi - self.extra_deduction - self.senior_deduction(agi)

    def federal(self, income):
        base = self._federal_base(income)
        if np.ndim(base):
            return vectorized_federal_tax(base, self.filing_status)
        return calculate_federal_tax(float(base), self.filing_status)

    def state_income(self, income):
        """The income state tax applies to: benefits and IRA money drop out where
        the state exempts them."""
        out = np.asarray(income, dtype=float)
        if self.other_income is not None:
            out = out - retirement_exclusion(
                self.state,
                self.filing_status,
                self.age,
                out - self.other_income,
                self.agi(income),
                self.fixed_scale,
            )
        if self.social_security > 0 and self.state not in STATES_TAXING_SOCIAL_SECURITY:
            out = np.maximum(0.0, out - self.social_security)
        return out if np.ndim(income) else float(out)

    def state_tax(self, income):
        if not self.state:
            return np.zeros_like(income, dtype=float) if np.ndim(income) else 0.0
        income = self.state_income(income)
        if np.ndim(income):
            return vectorized_state_tax(
                income, self.state, self.filing_status, self.custom_state_rate, self.fixed_scale
            )
        return calculate_state_tax(
            float(income), self.state, self.filing_status, self.custom_state_rate, self.fixed_scale
        )

    def total(self, income):
        return self.federal(income) + self.state_tax(income)

    def federal_bracket(self, income: float) -> float:
        """Federal bracket rate the last dollar of ``income`` falls in."""
        return get_marginal_rate(self._federal_base(income), self.filing_status)

    def under_standard_deduction(self, income: float, standard_deduction: float) -> bool:
        return self._federal_base(income) <= standard_deduction


def year_tax(scenario: ScenarioInput, t: int, state: str | None = None) -> YearTax:
    """``YearTax`` for timeline year ``t``. ``state`` overrides the year's state."""
    entry = scenario.timeline[t]
    seniors = scenario.people_at_least(SENIOR_DEDUCTION_AGE, t)
    return YearTax(
        filing_status=scenario.filing_status,
        state=state if state is not None else resolve_state_for_year(entry.state, scenario.state),
        custom_state_rate=scenario.custom_state_rate,
        social_security=min(entry.social_security or 0.0, entry.gross_income),
        extra_deduction=seniors * ADDITIONAL_DEDUCTION_65[scenario.filing_status],
        senior_bonus_people=seniors if entry.year in SENIOR_BONUS_YEARS else 0,
        medicare_people=scenario.people_at_least(MEDICARE_START_AGE, t + IRMAA_LOOKBACK_YEARS),
        fixed_scale=scenario.fixed_dollar_scale(t),
        irmaa_scale=lookback_threshold_scale(scenario.inflation_rate),
        other_income=entry.gross_income,
        age=scenario.age + t,
    )


def year_taxes(scenario: ScenarioInput) -> list[YearTax]:
    return [year_tax(scenario, t) for t in range(len(scenario.timeline))]
