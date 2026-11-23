"""Tests for the years the accounts fund spending: budgets, timing, the plan's end."""

import pytest

from app.engine.cashflow import plan_for
from app.engine.optimizer import _build_rmd_projection, calculate_npv
from app.engine.retirement import (
    conversion_bases,
    post_timeline_start,
    post_timeline_tax,
    terminal_tax_rate,
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


class TestTerminalRate:
    def test_rate_is_marginal_rate_on_final_year_income(self):
        """Final year in the timeline: the next $1,000 on top of income, RMD and the
        traditional withdrawal that funds spending and tax."""
        timeline = [PlanYear(year=2026 + i, gross_income=40_000) for i in range(3)]
        s = _scenario(timeline=timeline, drawdown_start_age=60, planning_horizon_age=62)
        income = conversion_bases(s, [0.0] * 3)[-1]
        yt = year_tax(s, 2)
        expected = (yt.total(income + 1_000) - yt.total(income)) / 1_000
        assert terminal_tax_rate(s) == pytest.approx(expected)
        # $80k after tax takes more than $40k from the account on top of $40k income
        assert income - yt.total(income) == pytest.approx(80_000, abs=0.01)

    def test_rate_in_post_timeline_final_year(self):
        """Final year after the timeline: marginal tax on that year's withdrawal."""
        s = _scenario()  # one drawdown year at 61 funding $80k after tax
        final = plan_for(s).no_conversion.flows[-1]
        expected = (
            withdrawal_tax(s, final.taxed_income + 1_000, 1)
            - withdrawal_tax(s, final.taxed_income, 1)
        ) / 1_000
        assert terminal_tax_rate(s) == pytest.approx(expected)

    def test_leftover_trad_at_flat_rate_and_roth_tax_free(self):
        s = _scenario(state="NY", roth_ira_balance=100_000)
        plan = plan_for(s)
        rate = terminal_tax_rate(s)
        walk = plan.no_conversion
        without_leftover = sum(
            (f.rule.from_accounts + f.outside) * plan.discount(f.rule.index) for f in walk.flows
        )
        left = walk.trad_end * (1 - rate) + walk.roth_end
        assert walk.value == pytest.approx(without_leftover + left * plan.discount(2))

    def test_rate_does_not_depend_on_the_schedule(self):
        """Every schedule values what it leaves at the same rate."""
        s = _margaret()
        plan = plan_for(s)
        before = plan.terminal_rate
        plan.walk([150_000.0] * 10)
        assert plan.terminal_rate == before


class TestPhaseTiming:
    def test_starts_at_drawdown_age_after_short_timeline(self):
        assert post_timeline_start(_scenario(drawdown_start_age=65)) == 5

    def test_starts_after_timeline_that_runs_past_drawdown_age(self):
        timeline = [PlanYear(year=2026 + i, gross_income=0) for i in range(8)]
        assert post_timeline_start(_scenario(timeline=timeline, drawdown_start_age=63)) == 8

    def test_years_before_the_drawdown_age_only_grow(self):
        s = _scenario(drawdown_start_age=64, planning_horizon_age=66)
        flows = plan_for(s).no_conversion.flows
        assert [f.rule.growth_only for f in flows] == [False, True, True, True] + [False] * 3
        g = s.real_growth_rate
        assert flows[3].trad_end == pytest.approx(s.traditional_ira_balance * (1 + g) ** 4)

    def test_first_drawdown_year_is_funded(self):
        """One drawdown year at 61: draw enough to net $80k, grow, value the rest at 62."""
        s = _scenario()
        g = s.real_growth_rate
        plan = plan_for(s)
        year = plan.no_conversion.flows[1]
        trad = s.traditional_ira_balance * (1 + g)  # after the timeline year
        draw = year.trad_draw
        tax = calculate_federal_tax(draw, s.filing_status)
        assert draw - tax == pytest.approx(80_000, abs=0.01)

        remaining = (trad - draw) * (1 + g)
        expected = 80_000 / (1 + g) + remaining * (1 - terminal_tax_rate(s)) / (1 + g) ** 2
        assert calculate_npv(s, [0.0]) == pytest.approx(expected)


class TestBudgets:
    """What each drawing year has to leave the household after tax."""

    def _full(self, **overrides) -> ScenarioInput:
        incomes = [20_000] * 4 + [46_000] + [60_000] * 26  # ages 63 to 93
        timeline = [PlanYear(year=2026 + i, gross_income=v) for i, v in enumerate(incomes)]
        return _margaret(timeline=timeline, **overrides)

    def test_spending_figure_is_the_budget_from_the_drawdown_age(self):
        budgets = [rule.budget for rule in plan_for(self._full()).years]
        assert budgets[:10] == [None] * 10  # ages 63 to 72
        assert budgets[10:] == [95_000] * 21

    def test_each_drawing_year_nets_its_budget(self):
        s = self._full()
        for flow in plan_for(s).no_conversion.flows[10:]:
            kept = flow.rule.income + flow.rmd + flow.trad_draw + flow.roth_draw - flow.tax
            assert kept - flow.outside == pytest.approx(95_000, abs=0.01)

    def test_income_above_spending_draws_nothing(self):
        """$60k of income leaves more than $50k after tax, so only RMDs come out."""
        flows = plan_for(self._full(default_drawdown=50_000)).no_conversion.flows[10:]
        assert {f.trad_draw + f.roth_draw for f in flows} == {0.0}
        assert all(f.outside > 0 for f in flows)

    def test_four_percent_rule_on_projected_balance(self):
        """Without a spending figure the budget is what income plus 4% of the balance
        projected to the drawdown age leaves after tax."""
        s = self._full(default_drawdown=None)
        projected = (s.traditional_ira_balance + s.roth_ira_balance) * (
            1 + s.real_growth_rate
        ) ** 10
        rule = plan_for(s).years[10]
        gross = 60_000 + projected * 0.04
        assert rule.budget == pytest.approx(gross - rule.tax.total(gross), abs=0.01)

    def test_explicit_drawdown_is_before_tax(self):
        """A year's own withdrawal figure is what comes out of the account. Its budget
        is what that and the year's income leave after tax."""
        s = self._full()
        s.timeline[12] = s.timeline[12].model_copy(update={"drawdown": 12_340})
        plan = plan_for(s)
        rule = plan.years[12]
        assert rule.budget == pytest.approx(72_340 - rule.tax.total(72_340), abs=0.01)
        flow = plan.no_conversion.flows[12]
        assert flow.rmd + flow.trad_draw >= 12_340 - 0.01

    def test_four_percent_rule_after_the_timeline(self):
        """Years after the timeline: 4% of the balance when they start, after tax."""
        s = _margaret(default_drawdown=None)
        plan = plan_for(s)
        at_start = plan.no_conversion.flows[9]
        gross = (at_start.trad_end + at_start.roth_end) * 0.04
        rule = plan.years[10]
        assert rule.income == 0
        assert rule.budget == pytest.approx(gross - post_timeline_tax(s, 10).total(gross))

    def test_rmd_counts_toward_spending(self):
        """An RMD above the budget is not topped up, and what is left over after tax
        stays with the household."""
        s = self._full(default_drawdown=62_000, traditional_ira_balance=4_000_000)
        late = plan_for(s).no_conversion.flows[25]
        assert late.rmd > 62_000
        assert late.trad_draw == 0 and late.roth_draw == 0
        assert late.outside == pytest.approx(60_000 + late.rmd - late.tax - 62_000, abs=0.01)

    def test_rmd_projection_includes_first_drawdown_year(self):
        """Margaret starts drawing at 73; her RMDs begin at 75 (born 1963)."""
        projection = _build_rmd_projection(_margaret(), [0.0] * 10)
        assert projection.yearly_detail[0].age == 75
        assert projection.yearly_detail[-1].age == 93

    def test_full_timeline_optimizes_and_reports_all_years(self):
        from app.engine.optimizer import optimize

        result = optimize(self._full())
        assert len(result.yearly_conversions) == 31
        assert result.input.timeline[10].drawdown is None  # the caller's input is returned
        assert len(result.timeline_chart) == 31
        assert result.estimated_lifetime_tax_savings > 0
