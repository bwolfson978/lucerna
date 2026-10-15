"""Tests for the post-timeline retirement phase (spending, Social Security, timing)."""

import numpy as np
import pytest

from app.engine.dp import _compute_retirement_values
from app.engine.optimizer import _build_rmd_projection, calculate_npv
from app.engine.retirement import (
    account_spending,
    conversion_bases,
    draw_beyond_rmd,
    post_timeline_start,
    resolve_drawdowns,
    terminal_tax_rate,
    terminal_value,
    vectorized_terminal_value,
    vectorized_withdrawal_tax,
    withdrawal_tax,
)
from app.engine.tax import calculate_federal_tax
from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.engine.year_tax import year_tax


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


class TestTerminalValue:
    def test_rate_is_marginal_rate_on_final_year_income(self):
        """Final year in the timeline: next $1,000 on top of income, RMD and spending draw."""
        timeline = [PlanYear(year=2026 + i, gross_income=40_000) for i in range(3)]
        s = _scenario(timeline=timeline, drawdown_start_age=60, planning_horizon_age=62)
        s = resolve_drawdowns(s)
        income = conversion_bases(s, [0.0] * 3)[-1]
        yt = year_tax(s, 2)
        expected = (yt.total(income + 1_000) - yt.total(income)) / 1_000
        assert terminal_tax_rate(s) == pytest.approx(expected)
        assert income == pytest.approx(80_000)  # $40k income plus the $40k spending draw

    def test_rate_in_post_timeline_final_year(self):
        """Final year after the timeline: marginal withdrawal tax on that year's distribution."""
        s = _scenario()  # one drawdown year at 61 funding $80k
        expected = (withdrawal_tax(s, 81_000) - withdrawal_tax(s, 80_000)) / 1_000
        assert terminal_tax_rate(s) == pytest.approx(expected)

    def test_values_trad_at_flat_rate_and_roth_tax_free(self):
        s = _scenario(state="NY")
        rate = terminal_tax_rate(s)
        disc = (1 + s.discount_rate) ** -3
        assert terminal_value(s, 500_000, 100_000, 3) == pytest.approx(
            (500_000 * (1 - rate) + 100_000) * disc
        )

    def test_no_bracket_jump_for_a_large_balance(self):
        """Value is linear in the leftover balance: no single-year lump sum."""
        s = _scenario()
        small = terminal_value(s, 100_000, 0.0, 0)
        assert terminal_value(s, 2_000_000, 0.0, 0) == pytest.approx(20 * small)

    def test_vectorized_matches_scalar(self):
        s = _scenario(state="NY")
        trad = np.array([0.0, 50_000, 400_000, 2_000_000])
        roth = np.array([10_000, 0.0, 250_000, 0.0])
        expected = [terminal_value(s, t, r, 7) for t, r in zip(trad, roth, strict=True)]
        np.testing.assert_allclose(vectorized_terminal_value(s, trad, roth, 7), expected)


class TestPhaseTiming:
    def test_starts_at_drawdown_age_after_short_timeline(self):
        assert post_timeline_start(_scenario(drawdown_start_age=65)) == 5

    def test_starts_after_timeline_that_runs_past_drawdown_age(self):
        timeline = [PlanYear(year=2026 + i, gross_income=0) for i in range(8)]
        assert post_timeline_start(_scenario(timeline=timeline, drawdown_start_age=63)) == 8

    def test_first_drawdown_year_is_funded(self):
        """One drawdown year at 61: spend, grow, then value the rest at 62."""
        s = _scenario()
        g, d = s.annual_growth_rate, s.discount_rate
        trad = s.traditional_ira_balance * (1 + g)  # after the timeline year
        spend = 80_000
        tax = calculate_federal_tax(spend, s.filing_status)
        remaining = (trad - spend) * (1 + g)
        expected = (spend - tax) / (1 + d) + terminal_value(s, remaining, 0.0, 2)

        assert calculate_npv(s, [0.0]) == pytest.approx(expected)

    def test_dp_terminal_values_match_calculate_npv(self):
        """The DP's retirement phase follows the same rules as calculate_npv."""
        s = _scenario(drawdown_start_age=63, planning_horizon_age=90, state="CA")
        g = s.annual_growth_rate
        trad = np.array([s.traditional_ira_balance * (1 + g) ** 3])
        roth = np.array([0.0])

        dp_value = _compute_retirement_values(trad, roth, s, len(s.timeline))[0]

        assert dp_value == pytest.approx(calculate_npv(s, [0.0]))


class TestWithdrawals:
    def test_explicit_spending(self):
        assert account_spending(_scenario(), 1e6) == 80_000

    def test_four_percent_rule(self):
        assert account_spending(_scenario(default_drawdown=None), 1_000_000) == 40_000

    def test_vectorized_tax_matches_scalar(self):
        s = _scenario(state="NY")
        amounts = np.array([0.0, 20_000.0, 150_000.0])
        expected = [withdrawal_tax(s, a) for a in amounts]
        assert vectorized_withdrawal_tax(s, amounts) == pytest.approx(expected)

    def test_rmd_projection_includes_first_drawdown_year(self):
        """Margaret starts drawing at 73; her RMDs begin at 75 (born 1963)."""
        projection = _build_rmd_projection(_margaret(), [0.0] * 10)
        assert projection.yearly_detail[0].age == 75
        assert projection.yearly_detail[-1].age == 93


class TestTimelineDrawdowns:
    """Timeline years at or after the drawdown age fund spending from the accounts."""

    def _full(self, **overrides) -> ScenarioInput:
        incomes = [20_000] * 4 + [46_000] + [60_000] * 26  # ages 63 to 93
        timeline = [PlanYear(year=2026 + i, gross_income=v) for i, v in enumerate(incomes)]
        return _margaret(timeline=timeline, **overrides)

    def test_spending_less_income_from_drawdown_age(self):
        resolved = resolve_drawdowns(self._full())
        draws = [row.drawdown for row in resolved.timeline]
        assert draws[:10] == [None] * 10  # ages 63 to 72
        assert draws[10:] == [35_000] * 21  # $95k spending less $60k Social Security

    def test_income_above_spending_draws_nothing(self):
        resolved = resolve_drawdowns(self._full(default_drawdown=50_000))
        assert {row.drawdown for row in resolved.timeline[10:]} == {0}

    def test_four_percent_rule_on_projected_balance(self):
        s = self._full(default_drawdown=None)
        projected = (s.traditional_ira_balance + s.roth_ira_balance) * (
            1 + s.annual_growth_rate
        ) ** 10
        resolved = resolve_drawdowns(s)
        assert resolved.timeline[10].drawdown == pytest.approx(projected * 0.04, abs=0.01)

    def test_explicit_drawdowns_are_kept(self):
        s = self._full()
        s.timeline[12] = s.timeline[12].model_copy(update={"drawdown": 1_234})
        assert resolve_drawdowns(s).timeline[12].drawdown == 1_234

    def test_short_timeline_is_unchanged(self):
        s = _margaret()
        assert resolve_drawdowns(s) is s

    def test_rmd_counts_toward_spending(self):
        assert draw_beyond_rmd(35_000, 50_000) == 0
        assert draw_beyond_rmd(35_000, 10_000) == 25_000
        assert draw_beyond_rmd(None, 10_000) == 0

    def test_full_timeline_optimizes_and_reports_all_years(self):
        from app.engine.optimizer import optimize

        result = optimize(self._full())
        assert len(result.yearly_conversions) == 31
        assert result.input.timeline[10].drawdown is None  # the caller's input is returned
        assert len(result.timeline_chart) == 31
        assert result.estimated_lifetime_tax_savings > 0
