"""Tests for the ACA premium tax credit calculator and subsidy-aware optimization.

Tests cover:
1. FPL calculation for various household sizes
2. Applicable percentage interpolation across tiers
3. Subsidy calculation (basic cases, cliff, edge cases)
4. Subsidy loss from Roth conversions
5. Combined marginal rate (federal tax + subsidy loss)
6. Integration with the optimizer (subsidy-aware NPV)
"""

from app.engine.aca import (
    _applicable_percentage,
    calculate_aca_subsidy,
    calculate_combined_marginal_rate,
    calculate_subsidy_loss,
    federal_poverty_level,
    find_subsidy_cliff_income,
)
from app.engine.optimizer import calculate_npv, optimize
from app.engine.types import (
    FilingStatus,
    HealthcareInput,
    OptimizationResult,
    ScenarioInput,
    YearlyIncome,
)


class TestFederalPovertyLevel:
    def test_single_person(self):
        assert federal_poverty_level(1) == 15650

    def test_household_of_two(self):
        assert federal_poverty_level(2) == 21150

    def test_household_of_four(self):
        assert federal_poverty_level(4) == 32150

    def test_increments_by_5500(self):
        for size in range(1, 8):
            expected = 15650 + 5500 * (size - 1)
            assert federal_poverty_level(size) == expected


class TestApplicablePercentage:
    def test_below_100_fpl_returns_none(self):
        """Income below 100% FPL is Medicaid range — no PTC."""
        assert _applicable_percentage(50) is None

    def test_above_400_fpl_returns_none(self):
        """Income above 400% FPL hits the cliff — no PTC."""
        assert _applicable_percentage(401) is None

    def test_at_100_fpl(self):
        """Bottom of the range: 2.10%."""
        pct = _applicable_percentage(100)
        assert abs(pct - 0.0210) < 0.001

    def test_at_150_fpl(self):
        """Tier boundary: should be 4.19%."""
        pct = _applicable_percentage(150)
        assert abs(pct - 0.0419) < 0.001

    def test_at_200_fpl(self):
        """Tier boundary: should be 6.63%."""
        pct = _applicable_percentage(200)
        assert abs(pct - 0.0663) < 0.001

    def test_at_300_fpl(self):
        """Tier boundary: should be 9.96%."""
        pct = _applicable_percentage(300)
        assert abs(pct - 0.0996) < 0.001

    def test_at_400_fpl(self):
        """Top of range: still 9.96%."""
        pct = _applicable_percentage(400)
        assert abs(pct - 0.0996) < 0.001

    def test_midpoint_interpolation(self):
        """125% FPL should be midpoint between 2.10% and 4.19%."""
        pct = _applicable_percentage(125)
        expected = 0.0210 + 0.5 * (0.0419 - 0.0210)
        assert abs(pct - expected) < 0.001

    def test_300_to_400_is_flat(self):
        """300-400% FPL tier has same start and end percentage."""
        pct_350 = _applicable_percentage(350)
        assert abs(pct_350 - 0.0996) < 0.001


class TestCalculateAcaSubsidy:
    def test_zero_income_no_subsidy(self):
        """Income of $0 is below 100% FPL — no subsidy."""
        subsidy = calculate_aca_subsidy(0, 1, 620)
        assert subsidy == 0.0

    def test_above_cliff_no_subsidy(self):
        """Income above 400% FPL ($62,600 for single) — no subsidy."""
        cliff = find_subsidy_cliff_income(1)
        subsidy = calculate_aca_subsidy(cliff + 1, 1, 620)
        assert subsidy == 0.0

    def test_low_income_gets_large_subsidy(self):
        """At 100% FPL ($15,650), contribution is only 2.1% → large subsidy."""
        subsidy = calculate_aca_subsidy(15650, 1, 620)
        annual_slcsp = 620 * 12  # $7,440
        expected_contribution = 15650 * 0.0210  # ~$328.65
        expected_subsidy = annual_slcsp - expected_contribution
        assert abs(subsidy - expected_subsidy) < 1

    def test_higher_income_smaller_subsidy(self):
        """Higher income should produce a smaller subsidy."""
        sub_low = calculate_aca_subsidy(20000, 1, 620)
        sub_high = calculate_aca_subsidy(40000, 1, 620)
        assert sub_low > sub_high

    def test_larger_household_higher_threshold(self):
        """Same income with larger household = more FPL room = bigger subsidy."""
        sub_single = calculate_aca_subsidy(40000, 1, 620)
        sub_family = calculate_aca_subsidy(40000, 4, 620)
        # Family FPL is higher, so same income is a lower % of FPL
        assert sub_family >= sub_single

    def test_subsidy_never_negative(self):
        """Even if expected contribution > SLCSP, subsidy should be 0, not negative."""
        # Very high income just below cliff with cheap plan
        subsidy = calculate_aca_subsidy(60000, 1, 200)
        assert subsidy >= 0


class TestSubsidyLoss:
    def test_no_conversion_no_loss(self):
        """Zero conversion should cause zero subsidy loss."""
        loss = calculate_subsidy_loss(30000, 0, 1, 620)
        assert loss == 0.0

    def test_conversion_reduces_subsidy(self):
        """A conversion that increases MAGI should reduce the subsidy."""
        loss = calculate_subsidy_loss(30000, 10000, 1, 620)
        assert loss > 0

    def test_conversion_pushing_over_cliff(self):
        """A conversion that pushes income above 400% FPL should cause maximum loss."""
        # Single person, FPL cliff at $62,600
        # Base income $55,000, conversion $10,000 → $65,000 (over cliff)
        loss = calculate_subsidy_loss(55000, 10000, 1, 620)
        # Should lose the entire subsidy at $55K
        subsidy_at_55k = calculate_aca_subsidy(55000, 1, 620)
        assert abs(loss - subsidy_at_55k) < 1

    def test_conversion_within_same_tier(self):
        """A small conversion within the same tier should cause proportional loss."""
        loss_small = calculate_subsidy_loss(30000, 1000, 1, 620)
        loss_large = calculate_subsidy_loss(30000, 5000, 1, 620)
        assert loss_large > loss_small


class TestCombinedMarginalRate:
    def test_zero_conversion(self):
        rate = calculate_combined_marginal_rate(30000, 0, 1, 620, FilingStatus.SINGLE)
        assert rate == 0.0

    def test_combined_exceeds_federal_only(self):
        """When ACA subsidy is affected, combined rate > federal-only rate."""
        from app.engine.tax import calculate_federal_tax

        income = 30000
        conversion = 10000
        fs = FilingStatus.SINGLE

        tax_with = calculate_federal_tax(income + conversion, fs)
        tax_without = calculate_federal_tax(income, fs)
        federal_rate = (tax_with - tax_without) / conversion

        combined_rate = calculate_combined_marginal_rate(income, conversion, 1, 620, fs)
        assert combined_rate >= federal_rate

    def test_near_cliff_very_high_rate(self):
        """Near the 400% FPL cliff, the combined rate should be very high."""
        # Income just below cliff — conversion pushes over
        rate = calculate_combined_marginal_rate(58000, 5000, 1, 620, FilingStatus.SINGLE)
        # Should be well above the federal rate alone
        assert rate > 0.30  # Federal 12% + significant subsidy loss


class TestSubsidyCliffIncome:
    def test_single_person(self):
        cliff = find_subsidy_cliff_income(1)
        assert cliff == 15650 * 4  # $62,600

    def test_household_of_four(self):
        cliff = find_subsidy_cliff_income(4)
        assert cliff == 32150 * 4  # $128,600


class TestOptimizerWithACA:
    """Integration tests: optimizer should account for ACA subsidy loss."""

    def _early_retiree_scenario(self, healthcare: HealthcareInput | None = None):
        """A 55-year-old early retiree on ACA marketplace."""
        return ScenarioInput(
            age=55,
            filing_status=FilingStatus.SINGLE,
            income_timeline=[
                YearlyIncome(year=2026, gross_income=25000),
                YearlyIncome(year=2027, gross_income=25000),
                YearlyIncome(year=2028, gross_income=25000),
            ],
            traditional_ira_balance=300000,
            roth_ira_balance=50000,
            retirement_age=65,
            years_in_retirement=25,
            annual_growth_rate=0.07,
            discount_rate=0.05,
            healthcare=healthcare,
        )

    def test_aca_aware_result_has_subsidy_fields(self):
        """When healthcare inputs are provided, result should include ACA data."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )
        result = optimize(scenario)
        assert result.aca_subsidy_impact is not None
        assert result.total_subsidy_lost is not None
        assert result.subsidy_cliff_income is not None
        assert result.npv_without_aca is not None

    def test_no_healthcare_no_aca_fields(self):
        """Without healthcare inputs, ACA fields should be None."""
        scenario = self._early_retiree_scenario(healthcare=None)
        result = optimize(scenario)
        assert result.aca_subsidy_impact is None
        assert result.total_subsidy_lost is None

    def test_aca_aware_converts_less_than_tax_only(self):
        """With ACA subsidies at stake, optimizer should convert less.

        For a low-income early retiree on ACA, the subsidy loss makes
        large conversions less attractive, so the optimizer should be
        more conservative.
        """
        scenario_no_aca = self._early_retiree_scenario(healthcare=None)
        scenario_with_aca = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )

        result_no_aca = optimize(scenario_no_aca)
        result_with_aca = optimize(scenario_with_aca)

        # ACA-aware should convert equal or less (subsidy loss is an additional cost)
        assert (
            result_with_aca.total_conversion <= result_no_aca.total_conversion + 100
        )  # rounding tolerance

    def test_aca_subsidy_detail_per_year(self):
        """Each ACA coverage year should have a detailed subsidy breakdown."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )
        result = optimize(scenario)
        assert len(result.aca_subsidy_impact) == 3  # 3 timeline years
        for detail in result.aca_subsidy_impact:
            assert detail.year in [2026, 2027, 2028]
            assert detail.magi_without_conversion >= 0
            assert detail.magi_with_conversion >= detail.magi_without_conversion

    def test_reasoning_trace_includes_aca(self):
        """Reasoning trace should include ACA impact when healthcare is provided."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )
        result = optimize(scenario)
        assert result.reasoning_trace.aca_impact is not None
        assert result.reasoning_trace.aca_summary is not None
        assert "explanation" in result.reasoning_trace.aca_summary

    def test_sensitivity_notes_mention_aca(self):
        """Sensitivity notes should mention ACA when healthcare is provided."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )
        result = optimize(scenario)
        aca_notes = [n for n in result.reasoning_trace.sensitivity_notes if "ACA" in n]
        assert len(aca_notes) > 0

    def test_aca_coverage_years_filter(self):
        """Only specified ACA coverage years should have subsidy impact."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(
                household_size=1,
                monthly_slcsp_premium=620,
                aca_coverage_years=[2026, 2027],  # Not 2028
            ),
        )
        result = optimize(scenario)
        aca_years = {d.year for d in result.aca_subsidy_impact}
        assert 2026 in aca_years
        assert 2027 in aca_years
        assert 2028 not in aca_years

    def test_employer_coverage_after_filter(self):
        """Years after employer coverage resumes should not have ACA impact."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(
                household_size=1,
                monthly_slcsp_premium=620,
                has_employer_coverage_after=2028,
            ),
        )
        result = optimize(scenario)
        aca_years = {d.year for d in result.aca_subsidy_impact}
        assert 2026 in aca_years
        assert 2027 in aca_years
        assert 2028 not in aca_years

    def test_npv_includes_aca_cost(self):
        """NPV with ACA should be different from NPV without ACA for same conversions."""
        scenario_with_aca = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )
        scenario_no_aca = self._early_retiree_scenario(healthcare=None)

        conversions = [30000.0, 30000.0, 0.0]
        npv_with = calculate_npv(scenario_with_aca, conversions)
        npv_without = calculate_npv(scenario_no_aca, conversions)

        # NPV with ACA should be lower (subsidy loss is a cost)
        assert npv_with < npv_without

    def test_mfj_household(self):
        """MFJ with household size 2 should work correctly."""
        scenario = ScenarioInput(
            age=55,
            filing_status=FilingStatus.MFJ,
            income_timeline=[
                YearlyIncome(year=2026, gross_income=50000),
                YearlyIncome(year=2027, gross_income=50000),
            ],
            traditional_ira_balance=400000,
            roth_ira_balance=50000,
            retirement_age=65,
            years_in_retirement=25,
            annual_growth_rate=0.07,
            discount_rate=0.05,
            healthcare=HealthcareInput(
                household_size=2,
                monthly_slcsp_premium=1100,  # ~$1100/month for a couple
            ),
        )
        result = optimize(scenario)
        assert isinstance(result, OptimizationResult)
        assert result.aca_subsidy_impact is not None
        # MFJ household of 2: cliff at $84,600
        assert result.subsidy_cliff_income == 21150 * 4

    def test_yearly_detail_includes_aca_fields(self):
        """Per-year detail should include subsidy_lost and combined_cost."""
        scenario = self._early_retiree_scenario(
            healthcare=HealthcareInput(household_size=1, monthly_slcsp_premium=620),
        )
        result = optimize(scenario)
        for detail in result.yearly_detail:
            # Years with ACA coverage should have subsidy fields
            if detail["conversion"] > 0:
                assert "subsidy_lost" in detail
                assert "combined_cost" in detail
                assert "combined_rate" in detail
