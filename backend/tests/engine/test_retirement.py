"""Tests for the post-timeline retirement phase (spending, Social Security, timing)."""

import numpy as np
import pytest

from app.engine.dp import _compute_retirement_values
from app.engine.optimizer import _build_rmd_projection, calculate_npv
from app.engine.retirement import (
    account_spending,
    post_timeline_start,
    vectorized_withdrawal_tax,
    withdrawal_tax,
)
from app.engine.tax import calculate_federal_tax
from app.engine.types import FilingStatus, PlanYear, ScenarioInput


def _scenario(**overrides) -> ScenarioInput:
    base = dict(
        age=60,
        filing_status=FilingStatus.MFJ,
        timeline=[PlanYear(year=2026, gross_income=0)],
        traditional_ira_balance=1_000_000,
        roth_ira_balance=0,
        drawdown_start_age=61,
        default_drawdown=80_000,
        planning_horizon_age=61,
        annual_growth_rate=0.05,
        discount_rate=0.03,
    )
    return ScenarioInput(**{**base, **overrides})


def _margaret(**overrides) -> ScenarioInput:
    timeline = [
        PlanYear(year=2026 + i, gross_income=income)
        for i, income in enumerate([20_000] * 4 + [46_000, 58_000] + [60_000] * 4)
    ]
    base = dict(
        age=63,
        filing_status=FilingStatus.MFJ,
        timeline=timeline,
        traditional_ira_balance=1_400_000,
        roth_ira_balance=52_000,
        drawdown_start_age=73,
        default_drawdown=95_000,
        planning_horizon_age=93,
    )
    return ScenarioInput(**{**base, **overrides})


class TestPhaseTiming:
    def test_starts_at_drawdown_age_after_short_timeline(self):
        assert post_timeline_start(_scenario(drawdown_start_age=65)) == 5

    def test_starts_after_timeline_that_runs_past_drawdown_age(self):
        timeline = [PlanYear(year=2026 + i, gross_income=0) for i in range(8)]
        assert post_timeline_start(_scenario(timeline=timeline, drawdown_start_age=63)) == 8

    def test_first_drawdown_year_is_funded(self):
        """One drawdown year at 61: spend, grow, then liquidate at 62."""
        s = _scenario()
        g, d = s.annual_growth_rate, s.discount_rate
        trad = s.traditional_ira_balance * (1 + g)  # after the timeline year
        spend = 80_000
        tax = calculate_federal_tax(spend, s.filing_status)
        remaining = (trad - spend) * (1 + g)
        liquidation = remaining - calculate_federal_tax(remaining, s.filing_status)
        expected = (spend - tax) / (1 + d) + liquidation / (1 + d) ** 2

        assert calculate_npv(s, [0.0]) == pytest.approx(expected)

    def test_dp_terminal_values_match_calculate_npv(self):
        """The DP's retirement phase follows the same rules as calculate_npv."""
        s = _scenario(
            drawdown_start_age=63, planning_horizon_age=90, retirement_income=30_000, state="CA"
        )
        g = s.annual_growth_rate
        trad = np.array([s.traditional_ira_balance * (1 + g) ** 3])
        roth = np.array([0.0])

        dp_value = _compute_retirement_values(trad, roth, s, len(s.timeline))[0]

        assert dp_value == pytest.approx(calculate_npv(s, [0.0]))


class TestRetirementIncome:
    def test_covers_part_of_spending(self):
        assert account_spending(_scenario(retirement_income=60_000), 1e6) == 20_000

    def test_never_makes_spending_negative(self):
        assert account_spending(_scenario(retirement_income=100_000), 1e6) == 0

    def test_four_percent_rule_ignores_it(self):
        s = _scenario(default_drawdown=None, retirement_income=60_000)
        assert account_spending(s, 1_000_000) == 40_000

    def test_withdrawals_are_taxed_on_top_of_it(self):
        alone = withdrawal_tax(_scenario(), 50_000)
        stacked = withdrawal_tax(_scenario(retirement_income=60_000), 50_000)
        assert stacked > alone
        fs = FilingStatus.MFJ
        assert stacked == pytest.approx(
            calculate_federal_tax(110_000, fs) - calculate_federal_tax(60_000, fs)
        )

    def test_vectorized_tax_matches_scalar(self):
        s = _scenario(retirement_income=45_000, state="NY")
        amounts = np.array([0.0, 20_000.0, 150_000.0])
        expected = [withdrawal_tax(s, a) for a in amounts]
        assert vectorized_withdrawal_tax(s, amounts) == pytest.approx(expected)

    def test_rmds_taxed_above_social_security(self):
        """Margaret's RMDs used to be taxed as if Social Security didn't exist."""
        without = _build_rmd_projection(_margaret(), [0.0] * 10)
        with_ss = _build_rmd_projection(_margaret(retirement_income=60_000), [0.0] * 10)

        assert without.yearly_detail[0].age == 75
        assert with_ss.yearly_detail[0].effective_rate > without.yearly_detail[0].effective_rate
        assert with_ss.total_rmd_taxes > without.total_rmd_taxes

    def test_makes_conversions_more_valuable(self):
        """Higher taxes on later withdrawals raise the value of converting now."""
        conversions = [100_000.0] * 10

        def gain(s):
            return calculate_npv(s, conversions) - calculate_npv(s, [0.0] * 10)

        assert gain(_margaret(retirement_income=60_000)) > gain(_margaret())
