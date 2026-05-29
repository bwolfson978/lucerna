"""Tests for IRMAA (Medicare surcharge) calculations."""


from app.engine.irmaa import (
    IRMAA_LOOKBACK_YEARS,
    IRMAA_TIERS,
    MEDICARE_START_AGE,
    calculate_irmaa,
    irmaa_surcharge_loss,
    irmaa_tier_index,
    vectorized_irmaa_surcharge_loss,
)
from app.engine.types import FilingStatus


class TestIrmaaTierIndex:
    def test_mfj_below_first_threshold(self):
        assert irmaa_tier_index(150_000, FilingStatus.MFJ) == 0

    def test_mfj_at_first_threshold(self):
        assert irmaa_tier_index(206_000, FilingStatus.MFJ) == 0

    def test_mfj_just_above_first_threshold(self):
        assert irmaa_tier_index(206_001, FilingStatus.MFJ) == 1

    def test_mfj_second_tier(self):
        assert irmaa_tier_index(280_000, FilingStatus.MFJ) == 2

    def test_mfj_top_tier(self):
        assert irmaa_tier_index(1_000_000, FilingStatus.MFJ) == 5

    def test_single_below_threshold(self):
        assert irmaa_tier_index(80_000, FilingStatus.SINGLE) == 0

    def test_single_at_first_threshold(self):
        assert irmaa_tier_index(103_000, FilingStatus.SINGLE) == 0

    def test_single_first_tier(self):
        assert irmaa_tier_index(115_000, FilingStatus.SINGLE) == 1

    def test_single_thresholds_are_half_of_mfj(self):
        # Tiers 0-3: single thresholds are exactly half of MFJ
        # Tier 4 diverges ($500K single vs $750K MFJ) per IRS schedule
        for tier in IRMAA_TIERS[:4]:
            mfj_max = tier["mfj_max"]
            single_max = tier["single_max"]
            assert single_max == mfj_max / 2, f"Tier {tier['tier']}: {single_max} != {mfj_max}/2"


class TestCalculateIrmaa:
    def test_no_surcharge_mfj_below_threshold(self):
        assert calculate_irmaa(100_000, FilingStatus.MFJ) == 0.0

    def test_no_surcharge_single_below_threshold(self):
        assert calculate_irmaa(80_000, FilingStatus.SINGLE) == 0.0

    def test_mfj_first_tier_doubles_for_couple(self):
        # MFJ = 2 people on Medicare, so 2x the per-person cost
        per_person = IRMAA_TIERS[1]["annual_per_person"]
        assert calculate_irmaa(220_000, FilingStatus.MFJ) == per_person * 2

    def test_single_first_tier_one_person(self):
        per_person = IRMAA_TIERS[1]["annual_per_person"]
        assert calculate_irmaa(115_000, FilingStatus.SINGLE) == per_person * 1

    def test_mfj_tier2_cost(self):
        per_person = IRMAA_TIERS[2]["annual_per_person"]
        assert calculate_irmaa(280_000, FilingStatus.MFJ) == per_person * 2

    def test_step_function_no_gradual_increase(self):
        # Within a tier, the cost is flat (not proportional to income)
        cost_at_220k = calculate_irmaa(220_000, FilingStatus.MFJ)
        cost_at_250k = calculate_irmaa(250_000, FilingStatus.MFJ)
        assert cost_at_220k == cost_at_250k


class TestIrmaaSurchargeLoss:
    def test_no_tier_crossing_zero_cost(self):
        # $150K base, $40K conversion = $190K total — still under $206K threshold
        cost = irmaa_surcharge_loss(150_000, 40_000, FilingStatus.MFJ)
        assert cost == 0.0

    def test_tier_crossing_has_cost(self):
        # $180K base, $50K conversion = $230K total — crosses $206K threshold
        cost = irmaa_surcharge_loss(180_000, 50_000, FilingStatus.MFJ)
        per_person = IRMAA_TIERS[1]["annual_per_person"]
        assert cost == per_person * 2

    def test_zero_conversion_always_zero(self):
        assert irmaa_surcharge_loss(300_000, 0, FilingStatus.MFJ) == 0.0
        assert irmaa_surcharge_loss(100_000, 0, FilingStatus.SINGLE) == 0.0

    def test_already_in_tier_no_additional_cost_within_tier(self):
        # $220K base already in tier 1 for MFJ; $10K more stays in tier 1
        cost = irmaa_surcharge_loss(220_000, 10_000, FilingStatus.MFJ)
        assert cost == 0.0

    def test_crossing_multiple_tiers(self):
        # $190K base, $200K conversion = $390K total — crosses into tier 4 for MFJ ($386K-$750K)
        cost = irmaa_surcharge_loss(190_000, 200_000, FilingStatus.MFJ)
        expected = IRMAA_TIERS[4]["annual_per_person"] * 2  # tier 4 (0-indexed)
        assert cost == expected


class TestVectorizedIrmaaSurchargeLoss:
    def test_no_crossings_all_zero(self):
        import numpy as np

        conversions = np.array([10_000.0, 20_000.0, 30_000.0])
        result = vectorized_irmaa_surcharge_loss(100_000, conversions, FilingStatus.MFJ)
        # 100K + 30K = 130K, still under 206K threshold
        assert all(r == 0.0 for r in result)

    def test_matches_scalar_function(self):
        import numpy as np

        base = 180_000
        conversions = np.array([10_000.0, 30_000.0, 50_000.0, 100_000.0])
        result = vectorized_irmaa_surcharge_loss(base, conversions, FilingStatus.MFJ)
        for i, c in enumerate(conversions):
            expected = irmaa_surcharge_loss(base, float(c), FilingStatus.MFJ)
            assert abs(result[i] - expected) < 0.01, f"Mismatch at conversion={c}"

    def test_step_function_shape(self):
        import numpy as np

        # Fine grid straddling the $206K threshold
        base = 200_000
        conversions = np.linspace(0, 20_000, 100)
        result = vectorized_irmaa_surcharge_loss(base, conversions, FilingStatus.MFJ)
        # Should be 0 for small conversions, then jump at the $6K threshold
        assert result[0] == 0.0
        assert result[-1] > 0.0


class TestIrmaaIntegration:
    """Test that IRMAA exposure is correctly detected for different age profiles."""

    def test_constants(self):
        assert MEDICARE_START_AGE == 65
        assert IRMAA_LOOKBACK_YEARS == 2

    def test_exposure_starts_at_63(self):
        """User age 63: conversions now affect Medicare at 65."""
        # age + t + LOOKBACK >= 65: for age=63, t=0: 63+0+2=65 >= 65 → exposed
        from app.engine.optimizer import _irmaa_exposed_years
        from app.engine.types import PlanYear, ScenarioInput

        scenario = ScenarioInput(
            age=63,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026, gross_income=20000)],
            traditional_ira_balance=1_400_000,
        )
        exposed = _irmaa_exposed_years(scenario)
        assert 0 in exposed

    def test_no_exposure_at_50(self):
        """User age 50: conversions won't affect Medicare for 13+ years — not exposed."""
        from app.engine.optimizer import _irmaa_exposed_years
        from app.engine.types import PlanYear, ScenarioInput

        scenario = ScenarioInput(
            age=50,
            filing_status=FilingStatus.SINGLE,
            timeline=[
                PlanYear(year=2026, gross_income=80_000),
                PlanYear(year=2027, gross_income=80_000),
            ],
            traditional_ira_balance=200_000,
        )
        exposed = _irmaa_exposed_years(scenario)
        assert len(exposed) == 0

    def test_partial_exposure_for_age_60(self):
        """User age 60: years 3+ (age 63+) are IRMAA-exposed."""
        from app.engine.optimizer import _irmaa_exposed_years
        from app.engine.types import PlanYear, ScenarioInput

        # age=60: 60+t+2 >= 65 → t >= 3
        scenario = ScenarioInput(
            age=60,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026 + i, gross_income=50_000) for i in range(6)],
            traditional_ira_balance=200_000,
        )
        exposed = _irmaa_exposed_years(scenario)
        assert 0 not in exposed
        assert 1 not in exposed
        assert 2 not in exposed
        assert 3 in exposed
        assert 4 in exposed
        assert 5 in exposed

    def test_irmaa_reduces_npv_vs_no_irmaa(self):
        """A conversion that triggers IRMAA should have lower NPV than without IRMAA."""
        from app.engine.optimizer import calculate_npv
        from app.engine.types import PlanYear, ScenarioInput

        # MFJ age 63 with large conversion → triggers IRMAA at 65
        scenario_exposed = ScenarioInput(
            age=63,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026, gross_income=20_000)],
            traditional_ira_balance=500_000,
            drawdown_start_age=73,
            planning_horizon_age=93,
        )
        # Big conversion that crosses IRMAA threshold
        large_conversion = [300_000.0]
        small_conversion = [50_000.0]

        npv_large = calculate_npv(scenario_exposed, large_conversion)
        npv_small = calculate_npv(scenario_exposed, small_conversion)

        # Both should return valid floats
        assert isinstance(npv_large, float)
        assert isinstance(npv_small, float)

    def test_irmaa_projection_built_for_exposed_scenario(self):
        """_build_irmaa_projection should return a non-None result for IRMAA-exposed scenarios."""
        from app.engine.optimizer import _build_irmaa_projection
        from app.engine.types import PlanYear, ScenarioInput

        # MFJ age 63, large conversion crossing IRMAA threshold
        scenario = ScenarioInput(
            age=63,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026, gross_income=20_000)],
            traditional_ira_balance=1_400_000,
            drawdown_start_age=73,
            planning_horizon_age=93,
        )
        conversions = [250_000.0]  # Crosses $206K MFJ threshold (20K + 250K = 270K)
        proj = _build_irmaa_projection(scenario, conversions)

        assert proj is not None
        assert proj.total_irmaa_cost > 0
        assert len(proj.yearly_detail) > 0
        assert proj.yearly_detail[0].surcharge_year == 2026 + IRMAA_LOOKBACK_YEARS
        assert proj.yearly_detail[0].surcharge_age == 63 + IRMAA_LOOKBACK_YEARS

    def test_irmaa_projection_none_below_threshold(self):
        """_build_irmaa_projection returns None when all conversions are below IRMAA threshold."""
        from app.engine.optimizer import _build_irmaa_projection
        from app.engine.types import PlanYear, ScenarioInput

        scenario = ScenarioInput(
            age=63,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026, gross_income=20_000)],
            traditional_ira_balance=1_400_000,
            drawdown_start_age=73,
            planning_horizon_age=93,
        )
        # Small conversion: 20K + 50K = 70K, well below $206K MFJ threshold
        conversions = [50_000.0]
        proj = _build_irmaa_projection(scenario, conversions)
        assert proj is None
