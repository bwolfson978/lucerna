"""Tests for state income tax calculations."""

import numpy as np
import pytest

from app.engine.types import FilingStatus
from app.engine.state_tax import (
    calculate_state_tax,
    get_state_marginal_rate,
    vectorized_state_tax,
    resolve_state_for_year,
    get_supported_states,
)


class TestResolveStateForYear:
    def test_year_override_takes_precedence(self):
        assert resolve_state_for_year("NY", "CA") == "NY"

    def test_falls_back_to_scenario_default(self):
        assert resolve_state_for_year(None, "CA") == "CA"

    def test_both_none_returns_none(self):
        assert resolve_state_for_year(None, None) is None


class TestCalculateStateTax:
    def test_zero_income(self):
        assert calculate_state_tax(0, "CA") == 0.0

    def test_none_state_returns_zero(self):
        assert calculate_state_tax(100_000, None) == 0.0

    def test_empty_state_returns_zero(self):
        assert calculate_state_tax(100_000, "") == 0.0

    def test_none_literal_returns_zero(self):
        assert calculate_state_tax(100_000, "none") == 0.0

    def test_unknown_state_returns_zero(self):
        assert calculate_state_tax(100_000, "XX") == 0.0

    def test_below_deduction_returns_zero(self):
        # CA single deduction is $5,540 — income below that should be zero
        assert calculate_state_tax(5_000, "CA") == 0.0

    def test_ca_single_known_bracket(self):
        # CA single: $100K gross, deduction $5,540, taxable $94,460
        # Brackets: 1% on first $10,756 = $107.56
        #           2% on $10,756–$25,499 = $294.86
        #           4% on $25,499���$40,245 = $589.84
        #           6% on $40,245–$55,866 = $937.26
        #           8% on $55,866–$70,606 = $1,179.20
        #           9.3% on $70,606–$94,460 = $2,218.42
        tax = calculate_state_tax(100_000, "CA", FilingStatus.SINGLE)
        assert tax == pytest.approx(5_327.14, abs=1.0)

    def test_ca_mfj(self):
        tax = calculate_state_tax(200_000, "CA", FilingStatus.MFJ)
        assert tax > 0
        # MFJ tax should be lower than single on same income (wider brackets)
        tax_single = calculate_state_tax(200_000, "CA", FilingStatus.SINGLE)
        assert tax < tax_single

    def test_ny_single(self):
        tax = calculate_state_tax(100_000, "NY", FilingStatus.SINGLE)
        assert tax > 0

    def test_nj_single(self):
        tax = calculate_state_tax(100_000, "NJ", FilingStatus.SINGLE)
        assert tax > 0

    def test_ma_flat_rate(self):
        # MA: 5% flat on income above $4,400 deduction (single)
        # $100K - $4,400 = $95,600 * 0.05 = $4,780
        tax = calculate_state_tax(100_000, "MA", FilingStatus.SINGLE)
        assert tax == pytest.approx(4_780.0, abs=1.0)

    def test_custom_flat_rate(self):
        # Custom: 5% on income above federal deduction ($15,000 single)
        # $100K - $15,000 = $85,000 * 0.05 = $4,250
        tax = calculate_state_tax(100_000, "custom", FilingStatus.SINGLE, custom_rate=0.05)
        assert tax == pytest.approx(4_250.0, abs=1.0)

    def test_custom_no_rate_returns_zero(self):
        assert calculate_state_tax(100_000, "custom") == 0.0

    def test_custom_zero_rate_returns_zero(self):
        assert calculate_state_tax(100_000, "custom", custom_rate=0.0) == 0.0

    def test_progressive_brackets_increase_with_income(self):
        tax_low = calculate_state_tax(50_000, "CA")
        tax_mid = calculate_state_tax(100_000, "CA")
        tax_high = calculate_state_tax(500_000, "CA")
        assert tax_low < tax_mid < tax_high


class TestGetStateMarginalRate:
    def test_none_state(self):
        assert get_state_marginal_rate(100_000, None) == 0.0

    def test_ca_high_income(self):
        # $400K gross in CA single → should be in 10.3% bracket (after deduction)
        rate = get_state_marginal_rate(400_000, "CA", FilingStatus.SINGLE)
        assert rate == 0.103

    def test_custom_rate(self):
        rate = get_state_marginal_rate(100_000, "custom", custom_rate=0.07)
        assert rate == 0.07

    def test_custom_below_deduction(self):
        rate = get_state_marginal_rate(10_000, "custom", custom_rate=0.07)
        assert rate == 0.0


class TestVectorizedStateTax:
    def test_matches_scalar(self):
        incomes = np.array([0, 50_000, 100_000, 200_000, 500_000], dtype=float)
        vectorized = vectorized_state_tax(incomes, "CA", FilingStatus.SINGLE)

        for i, income in enumerate(incomes):
            scalar = calculate_state_tax(income, "CA", FilingStatus.SINGLE)
            assert vectorized[i] == pytest.approx(scalar, abs=0.01), (
                f"Mismatch at income={income}: vectorized={vectorized[i]}, scalar={scalar}"
            )

    def test_none_state_returns_zeros(self):
        incomes = np.array([50_000, 100_000], dtype=float)
        result = vectorized_state_tax(incomes, None)
        np.testing.assert_array_equal(result, np.zeros(2))

    def test_custom_rate_vectorized(self):
        incomes = np.array([50_000, 100_000], dtype=float)
        result = vectorized_state_tax(incomes, "custom", custom_rate=0.05)
        for i, income in enumerate(incomes):
            scalar = calculate_state_tax(income, "custom", custom_rate=0.05)
            assert result[i] == pytest.approx(scalar, abs=0.01)


class TestGetSupportedStates:
    def test_returns_list(self):
        states = get_supported_states()
        assert isinstance(states, list)
        assert len(states) == 42

    def test_sorted_alphabetically(self):
        states = get_supported_states()
        names = [s["name"] for s in states]
        assert names == sorted(names)

    def test_has_expected_fields(self):
        states = get_supported_states()
        for state in states:
            assert "code" in state
            assert "name" in state
            assert "top_rate" in state
            assert "tax_type" in state
            assert isinstance(state["top_rate"], float)
            assert state["tax_type"] in ("flat", "progressive")
