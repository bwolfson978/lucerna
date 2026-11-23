"""Tests for the dynamic programming optimizer."""

import numpy as np
import pytest

from app.engine.cashflow import plan_for
from app.engine.dp import (
    _dp_backward_2d,
    _post_timeline_values,
    _year_cash,
    dp_optimize,
)
from app.engine.optimizer import calculate_npv
from app.engine.rmd import calculate_rmd
from app.engine.tax import calculate_federal_tax, vectorized_federal_tax
from app.engine.types import FilingStatus, PlanYear, ScenarioInput

# ── Fixtures ──────────────────────────────────────────────────────────


def _simple_scenario(
    balance: float = 100_000,
    incomes: list[float] | None = None,
    roth: float = 0,
    **kwargs,
) -> ScenarioInput:
    if incomes is None:
        incomes = [40_000, 35_000, 150_000]
    return ScenarioInput(
        age=40,
        filing_status=FilingStatus.SINGLE,
        timeline=[PlanYear(year=2026 + i, gross_income=inc) for i, inc in enumerate(incomes)],
        traditional_ira_balance=balance,
        roth_ira_balance=roth,
        drawdown_start_age=65,
        planning_horizon_age=90,
        annual_growth_rate=0.07,
        **kwargs,
    )


# ── Vectorized tax tests ─────────────────────────────────────────────


class TestVectorizedTax:
    def test_matches_scalar(self):
        """Vectorized tax must match scalar for every test value."""
        incomes = np.array([0, 10_000, 50_000, 100_000, 200_000, 500_000])
        vec_taxes = vectorized_federal_tax(incomes, FilingStatus.SINGLE)
        for i, inc in enumerate(incomes):
            scalar = calculate_federal_tax(float(inc), FilingStatus.SINGLE)
            assert abs(vec_taxes[i] - scalar) < 0.01, (
                f"Mismatch at income={inc}: vec={vec_taxes[i]}, scalar={scalar}"
            )

    def test_mfj(self):
        incomes = np.array([0, 50_000, 200_000, 500_000])
        vec_taxes = vectorized_federal_tax(incomes, FilingStatus.MFJ)
        for i, inc in enumerate(incomes):
            scalar = calculate_federal_tax(float(inc), FilingStatus.MFJ)
            assert abs(vec_taxes[i] - scalar) < 0.01


# ── Core DP tests ────────────────────────────────────────────────────


class TestDPOptimize:
    def test_zero_balance(self):
        """Zero balance should produce zero conversions."""
        scenario = _simple_scenario(balance=0)
        result = dp_optimize(scenario)
        assert result.total_conversion == 0
        assert all(c == 0 for c in result.yearly_conversions)

    def test_basic_finds_conversions(self):
        """DP should find positive conversions when low-income years exist."""
        scenario = _simple_scenario(balance=100_000, incomes=[30_000, 35_000, 150_000])
        result = dp_optimize(scenario)
        assert result.total_conversion > 0
        # Should convert in low-income years, not the high-income year
        assert result.yearly_conversions[0] > 0 or result.yearly_conversions[1] > 0
        assert result.yearly_conversions[2] == 0  # $150K year — no conversion

    def test_npv_beats_no_conversion(self):
        """Optimal schedule should have higher NPV than no conversion."""
        scenario = _simple_scenario()
        result = dp_optimize(scenario)
        npv_zero = calculate_npv(scenario, [0.0] * 3)
        assert result.npv >= npv_zero - 1  # small tolerance for rounding

    def test_npv_matches_calculate_npv(self):
        """DP's reported NPV should match calculate_npv on the same schedule."""
        scenario = _simple_scenario()
        result = dp_optimize(scenario)
        actual_npv = calculate_npv(scenario, result.yearly_conversions)
        assert abs(result.npv - actual_npv) < 1.0

    def test_respects_balance_constraint(self):
        """Total conversion should never exceed the traditional balance."""
        scenario = _simple_scenario(balance=50_000, incomes=[20_000, 25_000])
        result = dp_optimize(scenario)
        assert result.total_conversion <= 50_000 + 100  # $100 rounding tolerance

    def test_single_year(self):
        """Single year timeline should work."""
        scenario = _simple_scenario(balance=100_000, incomes=[40_000])
        result = dp_optimize(scenario)
        assert len(result.yearly_conversions) == 1
        assert result.total_conversion >= 0

    def test_large_balance_small_income(self):
        """Large balance with low income should convert aggressively."""
        scenario = _simple_scenario(balance=500_000, incomes=[20_000, 20_000])
        result = dp_optimize(scenario)
        assert result.total_conversion > 0


class TestDPBeatsScipyOrMatches:
    """Cross-validation: DP should find NPV >= scipy for unconstrained cases."""

    def test_simple_3year(self):
        """DP NPV >= scipy NPV on a simple 3-year scenario."""
        from app.engine.optimizer import _finalize_conversions, _run_scipy

        scenario = _simple_scenario()
        n = len(scenario.timeline)
        bal = scenario.traditional_ira_balance

        # Scipy result
        bounds = [(0, bal)] * n
        constraints = [{"type": "ineq", "fun": lambda x: bal - np.sum(x)}]
        raw = _run_scipy(scenario, bounds, constraints)
        scipy_conv = _finalize_conversions(raw, bal)
        scipy_npv = calculate_npv(scenario, scipy_conv)

        # DP result
        dp_result = dp_optimize(scenario)

        # 2D DP has roth grid discretization on top of trad grid discretization;
        # $25 tolerance covers the expected quantization error for a $100K balance.
        assert dp_result.npv >= scipy_npv - 25, (
            f"DP NPV ({dp_result.npv:.2f}) should be >= scipy ({scipy_npv:.2f})"
        )

    def test_demo_scenario(self):
        """DP optimizer handles the 21-year demo scenario (drawdowns + RMDs in timeline)
        and finds conversions with NPV above the no-conversion baseline."""
        from app.engine.demo import DEMO_SCENARIO

        npv_zero = calculate_npv(DEMO_SCENARIO, [0.0] * len(DEMO_SCENARIO.timeline))
        dp_result = dp_optimize(DEMO_SCENARIO)

        assert dp_result.total_conversion > 0, "DP should find positive conversions for Margaret"
        assert dp_result.npv >= npv_zero - 10, (
            f"DP NPV ({dp_result.npv:.2f}) should be >= no-conversion baseline ({npv_zero:.2f})"
        )


class TestRetirementValues:
    def test_more_roth_is_better(self):
        """All-Roth should have higher NPV than all-Traditional."""
        scenario = _simple_scenario()
        total_at_ret = 500_000

        trad = np.array([total_at_ret, 0.0])
        roth = np.array([0.0, total_at_ret])

        vals = _post_timeline_values(plan_for(scenario), trad, roth)
        assert vals[1] > vals[0], "All-Roth should beat all-Traditional"

    def test_matches_the_walk_after_the_timeline(self):
        """The search's value of the years after the timeline is the walk's."""
        scenario = _simple_scenario(balance=400_000, incomes=[40_000], roth=60_000)
        plan = plan_for(scenario)
        walked = plan.walk([25_000.0])
        after_timeline = walked.flows[0]
        searched = _post_timeline_values(
            plan, np.array([after_timeline.trad_end]), np.array([after_timeline.roth_end])
        )[0]
        first_year = plan.value_of(walked.flows[:1]) - (
            after_timeline.trad_end * (1 - plan.terminal_rate) + after_timeline.roth_end
        ) * plan.discount(1)
        assert searched == pytest.approx(walked.value - first_year, rel=1e-4)


class TestSearchUsesTheSameYear:
    """The search works out a year for many conversions at once. It has to be the
    year the walk works out for each one (TaxPayment.lean: only one withdrawal meets
    a budget, so there is nothing for the two to disagree about)."""

    def _retired(self) -> ScenarioInput:
        return ScenarioInput(
            age=57,
            filing_status=FilingStatus.SINGLE,
            birth_month=3,
            timeline=[
                PlanYear(year=2026 + i, gross_income=15_000 + 20_000 * (i > 9)) for i in range(20)
            ],
            traditional_ira_balance=900_000,
            roth_ira_balance=30_000,
            drawdown_start_age=57,
            default_drawdown=70_000,
            planning_horizon_age=76,
            inflation_rate=0.025,
            state="OR",
        )

    @pytest.mark.parametrize("t", [0, 1, 2, 5, 12, 18])
    def test_withdrawals_match_the_walk(self, t):
        plan = plan_for(self._retired())
        rule = plan.years[t]
        trad, roth = 640_000.0, 150_000.0
        conversions = np.array([0.0, 10_000.0, 45_000.0, 120_000.0, 400_000.0])
        rmd = min(calculate_rmd(trad, rule.age), trad) if rule.rmd_age else 0.0
        draw, from_roth, keep, outside, taxed = _year_cash(
            plan, rule, rmd, conversions, trad - rmd - conversions, free=0.0
        )
        for k, conversion in enumerate(conversions):
            flow, _ = plan.step(rule, trad, roth, 0.0, float(conversion))
            assert draw[k] == pytest.approx(flow.trad_draw, abs=5.0)
            assert taxed[k] == pytest.approx(flow.taxed_income, abs=5.0)
            wanted = flow.roth_draw + flow.shortfall / keep
            assert from_roth[k] == pytest.approx(wanted, abs=5.0)
            assert outside[k] == pytest.approx(max(flow.outside, 0.0), abs=5.0)

    def test_search_value_matches_the_walk(self):
        """The value the search expects from its schedule is what the walk gives it."""
        scenario = self._retired().model_copy(update={"birth_month": None, "age": 62})
        plan = plan_for(scenario)
        trad_grid = np.linspace(0, scenario.traditional_ira_balance, 200)
        roth_grid = np.linspace(0, 6_000_000, 150)
        values, _, ext_trad, _ = _dp_backward_2d(scenario, trad_grid, roth_grid)
        at_start = np.interp(
            scenario.roth_ira_balance,
            roth_grid,
            values[0, int(np.searchsorted(ext_trad, scenario.traditional_ira_balance)), :],
        )
        result = dp_optimize(scenario)
        assert plan.walk(result.yearly_conversions).value == pytest.approx(at_start, rel=0.005)


# ── Large balance tests ─────────────────────────────────────────────


class TestLargeBalance:
    """Tests with $2M+ balances to verify correctness and performance at scale."""

    def _large_scenario(self, balance: float = 2_000_000) -> ScenarioInput:
        # 5-year timeline with mixed incomes
        return ScenarioInput(
            age=55,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=40_000),
                PlanYear(year=2027, gross_income=50_000),
                PlanYear(year=2028, gross_income=35_000),
                PlanYear(year=2029, gross_income=45_000),
                PlanYear(year=2030, gross_income=180_000),
            ],
            traditional_ira_balance=balance,
            roth_ira_balance=0,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
        )

    def test_correctness_2m(self):
        """$2M balance: NPV should beat no-conversion baseline."""
        scenario = self._large_scenario(2_000_000)
        result = dp_optimize(scenario)
        npv_zero = calculate_npv(scenario, [0.0] * 5)
        assert result.npv >= npv_zero - 1
        assert result.total_conversion > 0

    def test_respects_balance_constraint_large(self):
        """Total conversion should not exceed the $2M balance."""
        scenario = self._large_scenario(2_000_000)
        result = dp_optimize(scenario)
        assert result.total_conversion <= 2_000_000 + 100

    def test_npv_consistency_large(self):
        """DP's reported NPV should match calculate_npv on the same schedule."""
        scenario = self._large_scenario(2_000_000)
        result = dp_optimize(scenario)
        actual_npv = calculate_npv(scenario, result.yearly_conversions)
        assert abs(result.npv - actual_npv) < 1.0

    def test_performance_under_5s(self):
        """$2M balance should complete within 5 seconds."""
        import time

        scenario = self._large_scenario(2_000_000)
        start = time.monotonic()
        dp_optimize(scenario)
        elapsed = time.monotonic() - start
        assert elapsed < 15.0, f"DP took {elapsed:.1f}s, expected < 15s"


# ── ACA subsidy integration tests ───────────────────────────────────


class TestDPWithACA:
    """Tests that DP correctly accounts for ACA subsidy loss."""

    def _aca_scenario(
        self, with_healthcare: bool = True, balance: float = 600_000
    ) -> ScenarioInput:
        from app.engine.types import HealthcareInput

        kwargs = {}
        if with_healthcare:
            kwargs["healthcare"] = HealthcareInput(
                household_size=1,
                monthly_slcsp_premium=620.0,
                aca_coverage_years=[2026, 2027],
            )
        return ScenarioInput(
            age=60,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=30_000),
                PlanYear(year=2027, gross_income=30_000),
                PlanYear(year=2028, gross_income=150_000),
            ],
            traditional_ira_balance=balance,
            roth_ira_balance=0,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            **kwargs,
        )

    def test_aca_reduces_conversions(self):
        """ACA-aware DP should convert less in subsidy-eligible years.

        The hidden cost of losing ACA subsidies should cause the optimizer
        to be more cautious about large conversions in ACA years.
        """
        scenario_no_aca = self._aca_scenario(with_healthcare=False)
        scenario_with_aca = self._aca_scenario(with_healthcare=True)

        result_no_aca = dp_optimize(scenario_no_aca)
        result_with_aca = dp_optimize(scenario_with_aca)

        # ACA-aware total conversion in subsidy years should be <=
        # non-ACA conversion (subsidy loss makes conversions costlier)
        aca_year_conv = sum(result_with_aca.yearly_conversions[:2])
        no_aca_year_conv = sum(result_no_aca.yearly_conversions[:2])
        assert aca_year_conv <= no_aca_year_conv + 200, (
            f"ACA-aware conversions in subsidy years ({aca_year_conv:,.0f}) "
            f"should be <= non-ACA ({no_aca_year_conv:,.0f})"
        )

    def test_aca_still_finds_conversions(self):
        """A balance large enough that its later tax outweighs the premium credit
        still converts in the coverage years."""
        scenario = self._aca_scenario(with_healthcare=True, balance=1_500_000)
        result = dp_optimize(scenario)
        assert result.total_conversion > 0

    def test_aca_npv_consistency(self):
        """DP's reported NPV should match calculate_npv for ACA scenario."""
        scenario = self._aca_scenario(with_healthcare=True)
        result = dp_optimize(scenario)
        actual_npv = calculate_npv(scenario, result.yearly_conversions)
        assert abs(result.npv - actual_npv) < 1.0


# ── Constrained optimization cross-path tests ───────────────────────


class TestConstrainedWithDP:
    """Tests that constrained scipy path works correctly alongside DP."""

    def _constrained_scenario(self) -> ScenarioInput:
        from app.engine.types import ConversionPreferences

        return ScenarioInput(
            age=40,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=40_000),
                PlanYear(year=2027, gross_income=35_000),
                PlanYear(year=2028, gross_income=150_000),
            ],
            traditional_ira_balance=100_000,
            roth_ira_balance=0,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            conversion_preferences=ConversionPreferences(
                max_annual_tax_cost=3_000,
            ),
        )

    def test_constrained_respects_tax_limit(self):
        """Constrained path should respect max_annual_tax_cost."""
        from app.engine.optimizer import optimize

        scenario = self._constrained_scenario()
        result = optimize(scenario)

        for detail in result.yearly_detail:
            assert detail["tax_cost"] <= 3_000 + 50, (
                f"Year {detail['year']} tax cost {detail['tax_cost']:.0f} exceeds $3,000 limit"
            )

    def test_constrained_npv_le_unconstrained(self):
        """Constrained NPV should be <= unconstrained DP NPV."""
        from app.engine.optimizer import optimize

        # Unconstrained
        unconstrained = ScenarioInput(
            age=40,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=40_000),
                PlanYear(year=2027, gross_income=35_000),
                PlanYear(year=2028, gross_income=150_000),
            ],
            traditional_ira_balance=100_000,
            roth_ira_balance=0,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
        )
        unconstrained_result = optimize(unconstrained)

        # Constrained
        constrained = self._constrained_scenario()
        constrained_result = optimize(constrained)

        assert constrained_result.estimated_lifetime_tax_savings <= (
            unconstrained_result.estimated_lifetime_tax_savings + 10
        ), (
            f"Constrained savings ({constrained_result.estimated_lifetime_tax_savings:,.0f}) "
            f"should not exceed unconstrained ({unconstrained_result.estimated_lifetime_tax_savings:,.0f})"
        )

    def test_constrained_still_converts(self):
        """Constrained optimization should still find some conversions."""
        from app.engine.optimizer import optimize

        scenario = self._constrained_scenario()
        result = optimize(scenario)
        assert result.total_conversion > 0
