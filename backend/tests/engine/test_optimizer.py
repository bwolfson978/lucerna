"""Tests for the multi-year Roth conversion optimizer."""

from app.engine.heuristic import greedy_bracket_fill
from app.engine.optimizer import _build_rmd_projection, calculate_npv, optimize
from app.engine.rmd import get_distribution_period
from app.engine.types import (
    ConversionPreferences,
    FilingStatus,
    OptimizationResult,
    PlanYear,
    ScenarioInput,
)


class TestCalculateNPV:
    def test_zero_conversion_returns_baseline(self, sample_single_input):
        """Converting $0 in all years should return the baseline NPV."""
        scenario = sample_single_input()
        n_years = len(scenario.timeline)
        baseline = calculate_npv(scenario, [0.0] * n_years)
        assert baseline is not None
        assert isinstance(baseline, float)

    def test_different_conversions_different_npv(self, sample_single_input):
        """Different conversion schedules should produce different NPVs."""
        scenario = sample_single_input()
        n_years = len(scenario.timeline)
        npv_zero = calculate_npv(scenario, [0.0] * n_years)
        npv_some = calculate_npv(scenario, [50000.0] * n_years)
        assert npv_zero != npv_some


class TestOptimize:
    def test_returns_optimization_result(self, sample_single_input):
        """optimize() should return an OptimizationResult."""
        scenario = sample_single_input()
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)

    def test_yearly_conversions_length_matches_timeline(self, sample_single_input):
        """Should return one conversion amount per year in timeline."""
        scenario = sample_single_input()
        result = optimize(scenario)
        assert len(result.yearly_conversions) == len(scenario.timeline)

    def test_conversions_within_balance(self, sample_single_input):
        """Total conversions should not exceed traditional IRA balance."""
        scenario = sample_single_input()
        result = optimize(scenario)
        assert result.total_conversion <= scenario.traditional_ira_balance + 1

    def test_all_conversions_non_negative(self, sample_single_input):
        """All yearly conversions should be >= 0."""
        scenario = sample_single_input()
        result = optimize(scenario)
        for c in result.yearly_conversions:
            assert c >= 0

    def test_low_income_favors_conversion(self):
        """A low-income person should benefit from filling the lower brackets."""
        scenario = ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        assert result.total_conversion > 0

    def test_multi_year_places_conversions_in_low_income_years(self):
        """Optimizer should convert more in low-income years than high-income years."""
        scenario = ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=35000),
                PlanYear(year=2027, gross_income=30000),
                PlanYear(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        # Low-income years (0, 1) should have more conversion than high-income year (2)
        low_income_total = result.yearly_conversions[0] + result.yearly_conversions[1]
        high_income_conv = result.yearly_conversions[2]
        assert low_income_total > high_income_conv

    def test_savings_positive_for_low_income(self):
        """Estimated lifetime tax savings should be positive for low-income scenario."""
        scenario = ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        assert result.estimated_lifetime_tax_savings > 0

    def test_mfj_scenario(self, sample_mfj_input):
        """MFJ scenario should produce a valid result."""
        scenario = sample_mfj_input()
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)
        assert len(result.yearly_conversions) == 2

    def test_optimizer_beats_or_matches_heuristic(self):
        """Scipy result should have NPV >= greedy heuristic.

        The heuristic fills brackets greedily, but the optimizer maximizes
        NPV directly — it should find an equal or better solution.
        """
        scenario = ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=35000),
                PlanYear(year=2027, gross_income=30000),
                PlanYear(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        greedy = greedy_bracket_fill(scenario)
        npv_greedy = calculate_npv(scenario, greedy)

        result = optimize(scenario)
        npv_optimal = calculate_npv(scenario, result.yearly_conversions)

        assert npv_optimal >= npv_greedy - 1  # -1 for float tolerance


class TestConversionPreferences:
    """Tests for optional user constraints on the conversion schedule."""

    def _alex_scenario(self, **pref_overrides):
        prefs = ConversionPreferences(**pref_overrides)
        return ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=35000),
                PlanYear(year=2027, gross_income=30000),
                PlanYear(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
            conversion_preferences=prefs,
        )

    def test_no_preferences_same_as_unconstrained(self):
        """Empty preferences should not change the result."""
        unconstrained = ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=35000),
                PlanYear(year=2027, gross_income=30000),
                PlanYear(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        constrained = self._alex_scenario()
        r1 = optimize(unconstrained)
        r2 = optimize(constrained)
        assert r1.yearly_conversions == r2.yearly_conversions

    def test_max_annual_tax_cost_respected(self):
        """Each year's conversion tax should not exceed the cap.

        Small overshoot possible due to $100 rounding of conversion amounts.
        At 22% marginal rate, rounding by $100 can cause up to ~$22 overshoot.
        """
        scenario = self._alex_scenario(max_annual_tax_cost=5000)
        result = optimize(scenario)
        for detail in result.yearly_detail:
            assert detail["tax_cost"] <= 5000 + 50  # tolerance for $100 rounding

    def test_max_annual_tax_cost_reduces_conversions(self):
        """A tight tax cap should produce smaller conversions than unconstrained."""
        unconstrained = self._alex_scenario()
        constrained = self._alex_scenario(max_annual_tax_cost=5000)
        r_free = optimize(unconstrained)
        r_cap = optimize(constrained)
        assert r_cap.total_conversion <= r_free.total_conversion

    def test_max_conversion_per_year_respected(self):
        """No single year should exceed the per-year conversion cap."""
        scenario = self._alex_scenario(max_conversion_per_year=40000)
        result = optimize(scenario)
        for c in result.yearly_conversions:
            assert c <= 40000 + 1  # +1 for rounding

    def test_min_conversion_years_spreads_conversions(self):
        """Optimizer should use at least N years when min_conversion_years is set."""
        scenario = self._alex_scenario(min_conversion_years=3)
        result = optimize(scenario)
        years_with_conversion = sum(1 for c in result.yearly_conversions if c >= 100)
        assert years_with_conversion >= 3

    def test_constrained_shows_unconstrained_comparison(self):
        """When preferences are active, result should include the unconstrained NPV."""
        scenario = self._alex_scenario(max_annual_tax_cost=5000)
        result = optimize(scenario)
        assert result.unconstrained_npv is not None
        assert result.unconstrained_npv >= result.npv_at_optimal

    def test_preferences_still_produce_valid_result(self):
        """Constrained result should still be a valid OptimizationResult."""
        scenario = self._alex_scenario(
            max_annual_tax_cost=5000,
            max_conversion_per_year=40000,
            min_conversion_years=2,
        )
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)
        assert len(result.yearly_conversions) == 3
        assert result.total_conversion >= 0
        assert all(c >= 0 for c in result.yearly_conversions)


class TestScenarioComparisonFields:
    """Scenarios include yearly_conversions, years, and estimated_savings."""

    def test_scenarios_have_yearly_conversions(self):
        scenario = ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=35000),
                PlanYear(year=2027, gross_income=30000),
                PlanYear(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        for sc in result.scenarios:
            assert len(sc.yearly_conversions) == 3
            assert len(sc.years) == 3
            assert sc.years == [2026, 2027, 2028]

    def test_scenarios_have_estimated_savings(self):
        scenario = ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        # "No conversion" should have 0 savings
        no_conv = next(s for s in result.scenarios if s.label == "No conversion")
        assert no_conv.estimated_savings == 0.0
        # "Highest estimated savings" should be positive for low-income scenario
        best = next(s for s in result.scenarios if s.difference_from_optimal == 0)
        assert best.estimated_savings > 0
        # estimated_savings should equal npv - npv_at_zero
        assert abs(best.estimated_savings - (best.npv - no_conv.npv)) < 1

    def test_no_conversion_yearly_conversions_are_zero(self):
        scenario = ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        no_conv = next(s for s in result.scenarios if s.label == "No conversion")
        assert all(c == 0.0 for c in no_conv.yearly_conversions)

    def test_full_conversion_puts_all_in_year_1(self):
        scenario = ScenarioInput(
            age=38,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=35000),
                PlanYear(year=2027, gross_income=30000),
            ],
            traditional_ira_balance=100000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        result = optimize(scenario)
        full = next(s for s in result.scenarios if "Full" in s.label)
        assert full.yearly_conversions[0] == 100000
        assert full.yearly_conversions[1] == 0.0


class TestStateTaxIntegration:
    """Verify that state tax changes optimizer behavior vs federal-only."""

    def _base_scenario(
        self, state=None, retirement_state=None, custom_state_rate=None, timeline_states=None
    ):
        traj = [
            PlanYear(
                year=2026,
                gross_income=150000,
                state=timeline_states[0] if timeline_states else None,
            ),
            PlanYear(
                year=2027,
                gross_income=150000,
                state=timeline_states[1] if timeline_states else None,
            ),
            PlanYear(
                year=2028,
                gross_income=150000,
                state=timeline_states[2] if timeline_states else None,
            ),
        ]
        return ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=traj,
            traditional_ira_balance=300000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
            state=state,
            retirement_state=retirement_state,
            custom_state_rate=custom_state_rate,
        )

    def test_state_none_backward_compat(self):
        """state=None should produce identical results to omitting state entirely."""
        scenario_no_state = ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=100000)],
            traditional_ira_balance=200000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )
        scenario_explicit_none = ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=100000)],
            traditional_ira_balance=200000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
            state=None,
        )
        npv1 = calculate_npv(scenario_no_state, [50000.0])
        npv2 = calculate_npv(scenario_explicit_none, [50000.0])
        assert npv1 == npv2

    def test_ca_state_tax_increases_conversion_cost(self):
        """CA state tax should make conversions more expensive (lower NPV for same schedule)."""
        federal_only = self._base_scenario(state=None)
        with_ca = self._base_scenario(state="CA")

        schedule = [100000.0, 100000.0, 100000.0]
        npv_federal = calculate_npv(federal_only, schedule)
        npv_ca = calculate_npv(with_ca, schedule)

        # CA adds ~9% marginal tax at $150K income, so NPV should be meaningfully lower
        assert npv_ca < npv_federal
        # The difference should be material (at least $1K for $300K of conversions)
        assert npv_federal - npv_ca > 1000

    def test_ca_optimizer_produces_different_schedule(self):
        """Optimizer with CA state tax should produce a different optimal schedule."""
        federal_only = self._base_scenario(state=None)
        with_ca = self._base_scenario(state="CA")

        result_federal = optimize(federal_only)
        result_ca = optimize(with_ca)

        # Both should produce valid results
        assert isinstance(result_federal, OptimizationResult)
        assert isinstance(result_ca, OptimizationResult)

        # At least one of: different total conversion, different NPV, or different schedule
        schedules_differ = result_federal.yearly_conversions != result_ca.yearly_conversions
        npv_differs = abs(result_federal.npv_at_optimal - result_ca.npv_at_optimal) > 100
        assert schedules_differ or npv_differs, (
            f"Expected different results with CA state tax. "
            f"Federal: {result_federal.yearly_conversions} (NPV={result_federal.npv_at_optimal}), "
            f"CA: {result_ca.yearly_conversions} (NPV={result_ca.npv_at_optimal})"
        )

    def test_per_year_state_override_shifts_conversions(self):
        """When one year is in a no-tax state, optimizer should favor converting that year."""
        # Years 1-2 in CA, year 3 in TX (no state tax)
        scenario = self._base_scenario(
            state="CA",
            timeline_states=["CA", "CA", "TX"],
        )
        result = optimize(scenario)

        # The TX year (index 2) should have at least as much conversion as either CA year
        # because the tax cost is lower in TX
        assert (
            result.yearly_conversions[2]
            >= min(result.yearly_conversions[0], result.yearly_conversions[1]) - 1
        ), (
            f"Expected TX year to have >= conversion than at least one CA year. "
            f"Schedule: {result.yearly_conversions}"
        )

    def test_yearly_detail_includes_state_tax_cost(self):
        """yearly_detail should report state_tax_cost when state is set."""
        with_ca = self._base_scenario(state="CA")
        result = optimize(with_ca)

        # At least one year with non-zero conversion should have state_tax_cost > 0
        has_state_tax = any(
            d.get("state_tax_cost", 0) > 0 for d in result.yearly_detail if d["conversion"] > 0
        )
        assert has_state_tax, (
            f"Expected state_tax_cost > 0 in yearly_detail for CA scenario. "
            f"Details: {result.yearly_detail}"
        )

    def test_custom_state_rate_applies(self):
        """Custom flat state rate should increase tax cost proportionally."""
        federal_only = self._base_scenario(state=None)
        with_custom = self._base_scenario(state="custom", custom_state_rate=0.10)

        schedule = [100000.0, 100000.0, 100000.0]
        npv_federal = calculate_npv(federal_only, schedule)
        npv_custom = calculate_npv(with_custom, schedule)

        assert npv_custom < npv_federal
        # 10% flat rate on $300K of conversions should create a significant difference
        assert npv_federal - npv_custom > 5000


class TestAlreadyRetired:
    """Tests for users whose retirement_age <= current age (already retired)."""

    def _retired_scenario(self, age=70, retirement_age=65, n_years=3):
        return ScenarioInput(
            age=age,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026 + i, gross_income=50000) for i in range(n_years)],
            traditional_ira_balance=500000,
            roth_ira_balance=50000,
            drawdown_start_age=retirement_age,
            planning_horizon_age=retirement_age + 25,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )

    def test_optimize_returns_valid_result(self):
        """optimize() should succeed when retirement_age < current age."""
        scenario = self._retired_scenario()
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)
        assert len(result.yearly_conversions) == 3
        assert result.total_conversion >= 0

    def test_retirement_age_equals_current_age(self):
        """retirement_age == current age should work (just retired)."""
        scenario = self._retired_scenario(age=65, retirement_age=65)
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)
        assert result.total_conversion >= 0

    def test_npv_positive_for_low_income_retiree(self):
        """Already-retired user with low income should benefit from conversion."""
        scenario = self._retired_scenario()
        n_years = len(scenario.timeline)
        npv_zero = calculate_npv(scenario, [0.0] * n_years)
        npv_some = calculate_npv(scenario, [50000.0] * n_years)
        # Converting at low income should produce higher NPV than not converting
        assert npv_some > npv_zero

    def test_conversions_within_balance(self):
        """Total conversions should not exceed traditional IRA balance."""
        scenario = self._retired_scenario()
        result = optimize(scenario)
        assert result.total_conversion <= scenario.traditional_ira_balance + 1


class TestRmdUsesPreGrowthBalance:
    """Regression tests: RMD must use Dec 31 prior-year balance, not post-growth balance."""

    def _rmd_scenario(self, age, retirement_age, balance=500_000, growth_rate=0.07):
        return ScenarioInput(
            age=age,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=60_000)],
            traditional_ira_balance=balance,
            roth_ira_balance=0,
            drawdown_start_age=retirement_age,
            planning_horizon_age=retirement_age + 10,
            annual_growth_rate=growth_rate,
            discount_rate=0.04,
        )

    def test_rmd_projection_balance_matches_rmd_divisor(self):
        """trad_balance_start and rmd_amount must use the same (pre-growth) base.

        With the IRS rule: RMD = prior_dec31_balance / distribution_period.
        After the fix, trad_balance_start is the pre-growth balance, so
        rmd_amount should equal trad_balance_start / distribution_period.
        """
        # User retiring at 74 — well into RMD territory
        scenario = self._rmd_scenario(age=70, retirement_age=70)
        projection = _build_rmd_projection(scenario, [0.0])
        assert projection is not None and projection.yearly_detail

        for detail in projection.yearly_detail:
            divisor = get_distribution_period(detail.age)
            assert divisor > 0
            expected_rmd = detail.trad_balance_start / divisor
            assert abs(detail.rmd_amount - expected_rmd) < 1.0, (
                f"At age {detail.age}: rmd_amount={detail.rmd_amount:.2f} but "
                f"trad_balance_start/divisor={expected_rmd:.2f}. "
                f"RMD is probably using post-growth balance."
            )

    def test_pre_growth_rmd_differs_from_post_growth(self):
        """Verify the fix actually changes results vs the old (buggy) behaviour.

        With g=7%, post-growth RMD is ~7% larger than pre-growth RMD.
        We confirm the projection rmd_amount is close to the pre-growth
        calculation and not the post-growth one.
        """
        g = 0.07
        balance = 500_000
        scenario = self._rmd_scenario(age=70, retirement_age=70, balance=balance, growth_rate=g)
        projection = _build_rmd_projection(scenario, [0.0])
        assert projection is not None and projection.yearly_detail

        first = projection.yearly_detail[0]
        divisor = get_distribution_period(first.age)

        # Pre-growth: balance before this year's returns are applied
        # Post-growth: balance * (1 + g)
        pre_growth_balance = first.trad_balance_start
        post_growth_balance = pre_growth_balance * (1 + g)

        pre_growth_rmd = pre_growth_balance / divisor
        post_growth_rmd = post_growth_balance / divisor

        # The recorded rmd_amount should match pre-growth, not post-growth
        assert abs(first.rmd_amount - pre_growth_rmd) < 1.0
        assert abs(first.rmd_amount - post_growth_rmd) > 100, (
            "RMD appears to be using the post-growth balance (old buggy behavior)."
        )
