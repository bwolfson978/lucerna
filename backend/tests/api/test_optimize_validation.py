"""Comprehensive validation tests for /api/optimize endpoint.

Tests 10+ different input scenarios including edge cases for every field,
plus functional behavior tests for realistic optimization scenarios.
"""

import pytest
from pydantic import ValidationError

from app.engine.types import (
    ConversionPreferences,
)

# ---------------------------------------------------------------------------
# 1. Age validation
# ---------------------------------------------------------------------------


class TestAgeValidation:
    """Age must be 0–120 (Pydantic ge=0, le=120)."""

    async def test_age_below_minimum(self, async_client):
        """Age -1 should return 422."""
        payload = dict(
            age=-1,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=100000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_age_above_maximum(self, async_client):
        """Age 121 should return 422."""
        payload = dict(
            age=121,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=100000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_age_at_lower_bound(self, async_client):
        """Age 0 should be accepted (custodial IRA)."""
        payload = dict(
            age=0,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 5000}],
            traditional_ira_balance=10000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_age_at_upper_bound(self, async_client):
        """Age 119 with retirement_age 120 should be accepted."""
        payload = dict(
            age=119,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=100000,
            retirement_age=120,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_age_non_integer(self, async_client):
        """Non-integer age should be rejected or coerced."""
        payload = dict(
            age="thirty",
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=100000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 2. Filing status validation
# ---------------------------------------------------------------------------


class TestFilingStatusValidation:
    async def test_invalid_filing_status(self, async_client):
        """Unrecognized filing status should return 422."""
        payload = dict(
            age=40,
            filing_status="head_of_household",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_married_filing_jointly(self, async_client):
        """MFJ is a valid filing status."""
        payload = dict(
            age=50,
            filing_status="married_filing_jointly",
            income_timeline=[{"year": 2026, "gross_income": 150000}],
            traditional_ira_balance=500000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 3. Income timeline validation
# ---------------------------------------------------------------------------


class TestIncomeTrajectoryValidation:
    async def test_empty_timeline(self, async_client):
        """Empty income timeline should return 422 (min_length=1)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[],
            traditional_ira_balance=200000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_missing_timeline(self, async_client):
        """Missing income_timeline field should return 422."""
        payload = dict(
            age=40,
            filing_status="single",
            traditional_ira_balance=200000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_negative_income(self, async_client):
        """Negative gross_income should return 422 (ge=0)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": -10000}],
            traditional_ira_balance=200000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_zero_income(self, async_client):
        """Zero income should be accepted (sabbatical year, etc.)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 0, "notes": "Sabbatical"}],
            traditional_ira_balance=200000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_many_year_timeline(self, async_client):
        """A long timeline (15 years) should be accepted."""
        timeline = [{"year": 2026 + i, "gross_income": 80000 + i * 2000} for i in range(15)]
        payload = dict(
            age=35,
            filing_status="single",
            income_timeline=timeline,
            traditional_ira_balance=300000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["yearly_conversions"]) == 15


# ---------------------------------------------------------------------------
# 4. Traditional IRA balance validation
# ---------------------------------------------------------------------------


class TestTraditionalBalanceValidation:
    async def test_negative_balance(self, async_client):
        """Negative traditional balance should return 422 (ge=0)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=-50000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_zero_balance(self, async_client):
        """Zero balance should be accepted — nothing to convert."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=0,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_conversion"] == 0

    async def test_very_large_balance(self, async_client):
        """$5M balance should be accepted and produce a result."""
        payload = dict(
            age=50,
            filing_status="married_filing_jointly",
            income_timeline=[{"year": 2026, "gross_income": 200000}],
            traditional_ira_balance=5000000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_conversion"] >= 0


# ---------------------------------------------------------------------------
# 5. Roth balance validation
# ---------------------------------------------------------------------------


class TestRothBalanceValidation:
    async def test_negative_roth(self, async_client):
        """Negative Roth balance should return 422 (ge=0)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            roth_ira_balance=-10000,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_defaults_to_zero(self, async_client):
        """Omitting roth_ira_balance should default to 0."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 6. Retirement age validation
# ---------------------------------------------------------------------------


class TestRetirementAgeValidation:
    async def test_retirement_age_below_minimum(self, async_client):
        """Retirement age 0 should return 422 (ge=1)."""
        payload = dict(
            age=0,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=100000,
            retirement_age=0,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_retirement_age_above_maximum(self, async_client):
        """Retirement age 121 should return 422 (le=120)."""
        payload = dict(
            age=50,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=121,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 7. Growth and discount rate validation
# ---------------------------------------------------------------------------


class TestRateValidation:
    """Growth and discount rates are unconstrained — users can experiment freely."""

    async def test_extreme_growth_rate_accepted(self, async_client):
        """Very high growth rate (500%) should be accepted — user can experiment."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            annual_growth_rate=5.0,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_negative_growth_rate_accepted(self, async_client):
        """Negative growth rate (-50%) should be accepted — user can experiment."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            annual_growth_rate=-0.50,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_extreme_discount_rate_accepted(self, async_client):
        """Very high discount rate (200%) should be accepted — user can experiment."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            discount_rate=2.0,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_zero_rates_accepted(self, async_client):
        """Zero growth and discount rates should be accepted."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            annual_growth_rate=0.0,
            discount_rate=0.0,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 8. Years in retirement validation
# ---------------------------------------------------------------------------


class TestYearsInRetirementValidation:
    async def test_below_minimum(self, async_client):
        """years_in_retirement < 1 should return 422 (ge=1)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            years_in_retirement=0,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_defaults_to_25(self, async_client):
        """Omitting years_in_retirement should default to 25 and work."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 9. Healthcare / ACA input validation
# ---------------------------------------------------------------------------


class TestHealthcareValidation:
    async def test_household_size_zero(self, async_client):
        """Household size 0 should return 422 (ge=1)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            healthcare={"household_size": 0, "monthly_slcsp_premium": 620},
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_large_household_accepted(self, async_client):
        """Large household (size 20) should be accepted — no real-world cap."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            healthcare={"household_size": 20, "monthly_slcsp_premium": 620},
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200

    async def test_negative_slcsp_premium(self, async_client):
        """Negative SLCSP premium should return 422 (ge=0)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 50000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            healthcare={"household_size": 1, "monthly_slcsp_premium": -100},
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 422

    async def test_valid_healthcare_inputs(self, async_client):
        """Valid healthcare inputs should be accepted and affect results."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 45000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            healthcare={"household_size": 2, "monthly_slcsp_premium": 800},
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("aca_subsidy_impact") is not None

    async def test_healthcare_with_employer_coverage_year(self, async_client):
        """Employer coverage year should limit ACA modeling to earlier years."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[
                {"year": 2026, "gross_income": 45000},
                {"year": 2027, "gross_income": 50000},
                {"year": 2028, "gross_income": 90000, "notes": "Back to work"},
            ],
            traditional_ira_balance=200000,
            retirement_age=65,
            healthcare={
                "household_size": 1,
                "monthly_slcsp_premium": 620,
                "has_employer_coverage_after": 2028,
            },
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # ACA impact should only cover years before 2028
        aca_impact = data.get("aca_subsidy_impact", [])
        aca_years = [d["year"] for d in aca_impact]
        assert 2028 not in aca_years


# ---------------------------------------------------------------------------
# 10. Conversion preferences validation
# ---------------------------------------------------------------------------


class TestConversionPreferencesValidation:
    async def test_negative_max_tax_cost(self):
        """Negative max_annual_tax_cost should fail Pydantic validation."""
        with pytest.raises(ValidationError):
            ConversionPreferences(max_annual_tax_cost=-1000)

    async def test_negative_max_per_year(self):
        """Negative max_conversion_per_year should fail."""
        with pytest.raises(ValidationError):
            ConversionPreferences(max_conversion_per_year=-5000)

    async def test_min_conversion_years_zero(self):
        """min_conversion_years < 1 should fail."""
        with pytest.raises(ValidationError):
            ConversionPreferences(min_conversion_years=0)

    async def test_valid_preferences_via_api(self, async_client):
        """Valid conversion preferences should be accepted."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
            conversion_preferences={
                "max_annual_tax_cost": 10000,
                "max_conversion_per_year": 50000,
            },
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 11. Functional behavior tests — diverse realistic scenarios
# ---------------------------------------------------------------------------


class TestFunctionalScenarios:
    """Tests that the optimizer produces sensible results for real-world inputs."""

    async def test_young_low_income_single(self, async_client):
        """Young person with low income and moderate IRA — should convert aggressively."""
        payload = dict(
            age=25,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 30000}],
            traditional_ira_balance=50000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # Low income means low brackets are available — should convert something
        assert data["total_conversion"] > 0
        assert data["estimated_lifetime_tax_savings"] > 0

    async def test_high_income_single(self, async_client):
        """High earner ($400k) — may convert less since already in high brackets."""
        payload = dict(
            age=45,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 400000}],
            traditional_ira_balance=500000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # Result should be valid regardless of conversion amount
        assert data["total_conversion"] >= 0
        assert len(data["yearly_conversions"]) == 1
        assert data["overall_effective_rate"] >= 0

    async def test_sabbatical_year_favors_conversion(self, async_client):
        """Zero income sabbatical year should get large conversion (low brackets empty)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[
                {"year": 2026, "gross_income": 0, "notes": "Sabbatical"},
                {"year": 2027, "gross_income": 120000, "notes": "Back to work"},
            ],
            traditional_ira_balance=200000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        # Year 1 (sabbatical) should get more conversion than year 2
        assert data["yearly_conversions"][0] > data["yearly_conversions"][1]

    async def test_mfj_couple_moderate_income(self, async_client):
        """MFJ couple with $150k income, $500k IRA — typical FIRE scenario."""
        payload = dict(
            age=50,
            filing_status="married_filing_jointly",
            income_timeline=[
                {"year": 2026, "gross_income": 150000},
                {"year": 2027, "gross_income": 155000},
            ],
            traditional_ira_balance=500000,
            roth_ira_balance=100000,
            retirement_age=65,
            years_in_retirement=30,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["yearly_conversions"]) == 2
        assert data["total_conversion"] <= 500000
        assert len(data["scenarios"]) >= 3
        assert data["reasoning_trace"] is not None

    async def test_near_retirement_short_window(self, async_client):
        """Person 1 year from retirement — only 1 conversion year available."""
        payload = dict(
            age=64,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 70000}],
            traditional_ira_balance=300000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["yearly_conversions"]) == 1

    async def test_early_retiree_zero_income_multi_year(self, async_client):
        """Early retiree with 0 income for 5 years — should spread conversions across years."""
        timeline = [
            {"year": 2026 + i, "gross_income": 0, "notes": "Early retirement"} for i in range(5)
        ]
        payload = dict(
            age=45,
            filing_status="single",
            income_timeline=timeline,
            traditional_ira_balance=400000,
            retirement_age=50,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["yearly_conversions"]) == 5
        # Should use multiple years (not dump everything in year 1)
        years_with_conversion = sum(1 for c in data["yearly_conversions"] if c > 0)
        assert years_with_conversion >= 2

    async def test_result_structure_completeness(self, async_client):
        """Verify all expected fields are present in a successful response."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 80000}],
            traditional_ira_balance=200000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        # Core fields
        assert "yearly_conversions" in data
        assert "total_conversion" in data
        assert "total_tax_on_conversions" in data
        assert "overall_effective_rate" in data
        assert "estimated_lifetime_tax_savings" in data
        assert "npv_at_optimal" in data
        assert "npv_at_zero" in data

        # Detail fields
        assert "yearly_detail" in data
        assert "yearly_bracket_fill" in data
        assert "scenarios" in data
        assert "reasoning_trace" in data
        assert "traditional_at_retirement" in data
        assert "roth_at_retirement" in data
        assert "timeline_chart" in data
        assert "input" in data

    async def test_conversions_never_exceed_balance(self, async_client):
        """No matter the scenario, total conversions must not exceed IRA balance."""
        payload = dict(
            age=30,
            filing_status="single",
            income_timeline=[
                {"year": 2026, "gross_income": 20000},
                {"year": 2027, "gross_income": 15000, "notes": "Part-time"},
                {"year": 2028, "gross_income": 10000, "notes": "Grad school"},
            ],
            traditional_ira_balance=80000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_conversion"] <= 80000 + 1  # +1 for rounding

    async def test_aca_aware_optimization(self, async_client):
        """ACA-aware optimization should produce subsidy impact data."""
        payload = dict(
            age=42,
            filing_status="single",
            income_timeline=[
                {"year": 2026, "gross_income": 35000, "notes": "Startup"},
            ],
            traditional_ira_balance=150000,
            retirement_age=65,
            healthcare={
                "household_size": 3,
                "monthly_slcsp_premium": 900,
            },
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["aca_subsidy_impact"] is not None
        assert data["total_subsidy_lost"] is not None
        assert data["npv_without_aca"] is not None

    async def test_optimal_npv_beats_no_conversion(self, async_client):
        """Optimal NPV should be >= no-conversion NPV (optimizer should not make things worse)."""
        payload = dict(
            age=40,
            filing_status="single",
            income_timeline=[{"year": 2026, "gross_income": 60000}],
            traditional_ira_balance=200000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["npv_at_optimal"] >= data["npv_at_zero"] - 1  # float tolerance

    async def test_already_retired_returns_200(self, async_client):
        """retirement_age < current age (already retired) should return 200."""
        payload = dict(
            age=70,
            filing_status="married_filing_jointly",
            income_timeline=[
                {"year": 2026, "gross_income": 50000},
                {"year": 2027, "gross_income": 50000},
                {"year": 2028, "gross_income": 50000},
            ],
            traditional_ira_balance=500000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_conversion"] >= 0
        assert len(data["yearly_conversions"]) == 3

    async def test_retirement_age_equals_current_age_returns_200(self, async_client):
        """retirement_age == current age should return 200."""
        payload = dict(
            age=65,
            filing_status="single",
            income_timeline=[
                {"year": 2026, "gross_income": 40000},
            ],
            traditional_ira_balance=300000,
            retirement_age=65,
        )
        resp = await async_client.post("/api/optimize", json=payload)
        assert resp.status_code == 200
