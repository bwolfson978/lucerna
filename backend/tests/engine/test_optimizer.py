"""Tests for the multi-year Roth conversion optimizer."""

import pytest

from app.engine.optimizer import optimize, calculate_npv
from app.engine.heuristic import greedy_bracket_fill
from app.engine.types import (
    ScenarioInput, FilingStatus, YearlyIncome, OptimizationResult,
    ConversionPreferences,
)


class TestCalculateNPV:
    def test_zero_conversion_returns_baseline(self, sample_single_input):
        """Converting $0 in all years should return the baseline NPV."""
        scenario = sample_single_input()
        n_years = len(scenario.income_trajectory)
        baseline = calculate_npv(scenario, [0.0] * n_years)
        assert baseline is not None
        assert isinstance(baseline, float)

    def test_different_conversions_different_npv(self, sample_single_input):
        """Different conversion schedules should produce different NPVs."""
        scenario = sample_single_input()
        n_years = len(scenario.income_trajectory)
        npv_zero = calculate_npv(scenario, [0.0] * n_years)
        npv_some = calculate_npv(scenario, [50000.0] * n_years)
        assert npv_zero != npv_some


class TestOptimize:
    def test_returns_optimization_result(self, sample_single_input):
        """optimize() should return an OptimizationResult."""
        scenario = sample_single_input()
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)

    def test_yearly_conversions_length_matches_trajectory(self, sample_single_input):
        """Should return one conversion amount per year in trajectory."""
        scenario = sample_single_input()
        result = optimize(scenario)
        assert len(result.yearly_conversions) == len(scenario.income_trajectory)

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
            age=45, filing_status=FilingStatus.SINGLE,
            income_trajectory=[YearlyIncome(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        result = optimize(scenario)
        assert result.total_conversion > 0

    def test_multi_year_places_conversions_in_low_income_years(self):
        """Optimizer should convert more in low-income years than high-income years."""
        scenario = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        result = optimize(scenario)
        # Low-income years (0, 1) should have more conversion than high-income year (2)
        low_income_total = result.yearly_conversions[0] + result.yearly_conversions[1]
        high_income_conv = result.yearly_conversions[2]
        assert low_income_total > high_income_conv

    def test_savings_positive_for_low_income(self):
        """Estimated lifetime tax savings should be positive for low-income scenario."""
        scenario = ScenarioInput(
            age=45, filing_status=FilingStatus.SINGLE,
            income_trajectory=[YearlyIncome(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
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
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
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
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
            conversion_preferences=prefs,
        )

    def test_no_preferences_same_as_unconstrained(self):
        """Empty preferences should not change the result."""
        unconstrained = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
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
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        result = optimize(scenario)
        for sc in result.scenarios:
            assert len(sc.yearly_conversions) == 3
            assert len(sc.years) == 3
            assert sc.years == [2026, 2027, 2028]

    def test_scenarios_have_estimated_savings(self):
        scenario = ScenarioInput(
            age=45, filing_status=FilingStatus.SINGLE,
            income_trajectory=[YearlyIncome(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
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
            age=45, filing_status=FilingStatus.SINGLE,
            income_trajectory=[YearlyIncome(year=2026, gross_income=25000)],
            traditional_ira_balance=100000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        result = optimize(scenario)
        no_conv = next(s for s in result.scenarios if s.label == "No conversion")
        assert all(c == 0.0 for c in no_conv.yearly_conversions)

    def test_full_conversion_puts_all_in_year_1(self):
        scenario = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
            ],
            traditional_ira_balance=100000,
            retirement_age=65, years_in_retirement=25,
            annual_growth_rate=0.07, discount_rate=0.05,
        )
        result = optimize(scenario)
        full = next(s for s in result.scenarios if "Full" in s.label)
        assert full.yearly_conversions[0] == 100000
        assert full.yearly_conversions[1] == 0.0
