"""Tests for the unified tax cost calculation module."""

import pytest

from app.engine.tax_cost import (
    combined_marginal_rate,
    federal_tax_on_conversion,
    state_tax_on_conversion,
    total_conversion_cost,
)
from app.engine.types import FilingStatus, HealthcareInput


class TestFederalTaxOnConversion:
    """Test federal_tax_on_conversion against known bracket math."""

    def test_zero_conversion_returns_zero(self):
        assert federal_tax_on_conversion(50_000, 0, FilingStatus.SINGLE) == 0.0

    def test_positive_conversion_returns_positive(self):
        cost = federal_tax_on_conversion(50_000, 10_000, FilingStatus.SINGLE)
        assert cost > 0

    def test_conversion_is_marginal_cost(self):
        """Cost should equal tax(income+conv) - tax(income)."""
        from app.engine.tax import calculate_federal_tax

        income = 80_000
        conversion = 20_000
        fs = FilingStatus.SINGLE

        expected = calculate_federal_tax(income + conversion, fs) - calculate_federal_tax(
            income, fs
        )
        assert federal_tax_on_conversion(income, conversion, fs) == pytest.approx(expected)

    def test_mfj_lower_than_single(self):
        """MFJ should have lower marginal cost at moderate income."""
        income = 100_000
        conversion = 20_000

        single_cost = federal_tax_on_conversion(income, conversion, FilingStatus.SINGLE)
        mfj_cost = federal_tax_on_conversion(income, conversion, FilingStatus.MFJ)
        assert mfj_cost <= single_cost


class TestStateTaxOnConversion:
    """Test state_tax_on_conversion."""

    def test_no_state_returns_zero(self):
        assert state_tax_on_conversion(50_000, 10_000, None, FilingStatus.SINGLE) == 0.0

    def test_none_string_returns_zero(self):
        assert state_tax_on_conversion(50_000, 10_000, "none", FilingStatus.SINGLE) == 0.0

    def test_custom_rate(self):
        cost = state_tax_on_conversion(
            50_000,
            10_000,
            "custom",
            FilingStatus.SINGLE,
            custom_state_rate=0.05,
        )
        assert cost > 0

    def test_known_state_returns_positive(self):
        cost = state_tax_on_conversion(80_000, 20_000, "CA", FilingStatus.SINGLE)
        assert cost > 0


class TestTotalConversionCost:
    """Test total_conversion_cost combining federal + state + ACA."""

    def test_federal_only(self):
        cost = total_conversion_cost(80_000, 20_000, FilingStatus.SINGLE)
        fed = federal_tax_on_conversion(80_000, 20_000, FilingStatus.SINGLE)
        assert cost == pytest.approx(fed)

    def test_federal_plus_state(self):
        cost = total_conversion_cost(
            80_000,
            20_000,
            FilingStatus.SINGLE,
            state="CA",
        )
        fed = federal_tax_on_conversion(80_000, 20_000, FilingStatus.SINGLE)
        assert cost > fed  # State adds cost

    def test_with_aca(self):
        hc = HealthcareInput(household_size=1, monthly_slcsp_premium=620)
        cost_with_aca = total_conversion_cost(
            30_000,
            10_000,
            FilingStatus.SINGLE,
            healthcare=hc,
            is_aca_year=True,
        )
        cost_without_aca = total_conversion_cost(
            30_000,
            10_000,
            FilingStatus.SINGLE,
        )
        # ACA subsidy loss should increase the cost
        assert cost_with_aca >= cost_without_aca

    def test_aca_not_applied_when_not_aca_year(self):
        hc = HealthcareInput(household_size=1, monthly_slcsp_premium=620)
        cost = total_conversion_cost(
            30_000,
            10_000,
            FilingStatus.SINGLE,
            healthcare=hc,
            is_aca_year=False,
        )
        cost_no_hc = total_conversion_cost(
            30_000,
            10_000,
            FilingStatus.SINGLE,
        )
        assert cost == pytest.approx(cost_no_hc)


class TestCombinedMarginalRate:
    """Test combined_marginal_rate."""

    def test_federal_only(self):
        from app.engine.tax import get_marginal_rate

        rate = combined_marginal_rate(80_000, 20_000, FilingStatus.SINGLE)
        expected = get_marginal_rate(100_000, FilingStatus.SINGLE)
        assert rate == pytest.approx(expected)

    def test_with_state_adds_to_rate(self):
        fed_rate = combined_marginal_rate(80_000, 20_000, FilingStatus.SINGLE)
        combined = combined_marginal_rate(
            80_000,
            20_000,
            FilingStatus.SINGLE,
            state="CA",
        )
        assert combined > fed_rate
