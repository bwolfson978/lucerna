"""Tests for Required Minimum Distribution (RMD) calculations.

Verifies IRS Uniform Lifetime Table lookups, RMD start age determination
per SECURE 2.0, and basic RMD amount calculations.
"""

import numpy as np
import pytest

from app.engine.rmd import (
    rmd_start_age,
    get_distribution_period,
    calculate_rmd,
    vectorized_rmd,
    UNIFORM_LIFETIME_TABLE,
)


class TestRmdStartAge:
    """SECURE 2.0 rules for when RMDs begin."""

    def test_born_1950_starts_at_72(self):
        # Born 1950 → age 76 in 2026
        assert rmd_start_age(76, 2026) == 72

    def test_born_1951_starts_at_73(self):
        # Born 1951 → age 75 in 2026
        assert rmd_start_age(75, 2026) == 73

    def test_born_1959_starts_at_73(self):
        # Born 1959 → age 67 in 2026
        assert rmd_start_age(67, 2026) == 73

    def test_born_1960_starts_at_75(self):
        # Born 1960 → age 66 in 2026
        assert rmd_start_age(66, 2026) == 75

    def test_born_1990_starts_at_75(self):
        # Born 1990 → age 36 in 2026
        assert rmd_start_age(36, 2026) == 75

    def test_different_current_year(self):
        # Born 1955 → age 75 in 2030
        assert rmd_start_age(75, 2030) == 73


class TestDistributionPeriod:
    """IRS Uniform Lifetime Table lookups."""

    def test_age_72(self):
        assert get_distribution_period(72) == 27.4

    def test_age_73(self):
        assert get_distribution_period(73) == 26.5

    def test_age_80(self):
        assert get_distribution_period(80) == 20.2

    def test_age_90(self):
        assert get_distribution_period(90) == 12.2

    def test_age_100(self):
        assert get_distribution_period(100) == 6.4

    def test_age_120(self):
        assert get_distribution_period(120) == 2.0

    def test_below_72_returns_zero(self):
        assert get_distribution_period(71) == 0.0
        assert get_distribution_period(50) == 0.0
        assert get_distribution_period(0) == 0.0

    def test_above_120_uses_120_value(self):
        assert get_distribution_period(125) == 2.0

    def test_table_is_monotonically_decreasing(self):
        ages = sorted(UNIFORM_LIFETIME_TABLE.keys())
        for i in range(1, len(ages)):
            assert UNIFORM_LIFETIME_TABLE[ages[i]] < UNIFORM_LIFETIME_TABLE[ages[i - 1]]


class TestCalculateRmd:
    """Basic RMD amount calculations."""

    def test_age_73_with_500k(self):
        """$500K / 26.5 ≈ $18,868."""
        rmd = calculate_rmd(500_000, 73)
        assert abs(rmd - 500_000 / 26.5) < 1

    def test_age_80_with_1m(self):
        """$1M / 20.2 ≈ $49,505."""
        rmd = calculate_rmd(1_000_000, 80)
        assert abs(rmd - 1_000_000 / 20.2) < 1

    def test_age_90_with_300k(self):
        """$300K / 12.2 ≈ $24,590."""
        rmd = calculate_rmd(300_000, 90)
        assert abs(rmd - 300_000 / 12.2) < 1

    def test_zero_balance_returns_zero(self):
        assert calculate_rmd(0, 73) == 0.0

    def test_below_rmd_age_returns_zero(self):
        assert calculate_rmd(500_000, 70) == 0.0
        assert calculate_rmd(500_000, 50) == 0.0

    def test_rmd_increases_as_fraction_of_balance_with_age(self):
        """Older ages have smaller divisors → larger RMD fractions."""
        balance = 500_000
        rmd_73 = calculate_rmd(balance, 73)
        rmd_80 = calculate_rmd(balance, 80)
        rmd_90 = calculate_rmd(balance, 90)
        assert rmd_73 < rmd_80 < rmd_90


class TestVectorizedRmd:
    """Vectorized RMD for the DP optimizer."""

    def test_basic_vectorized(self):
        balances = np.array([100_000, 500_000, 1_000_000])
        rmds = vectorized_rmd(balances, 73)
        expected = balances / 26.5
        np.testing.assert_allclose(rmds, expected)

    def test_below_rmd_age_returns_zeros(self):
        balances = np.array([100_000, 500_000, 1_000_000])
        rmds = vectorized_rmd(balances, 70)
        np.testing.assert_array_equal(rmds, np.zeros(3))

    def test_matches_scalar(self):
        """Vectorized should match scalar calculate_rmd for each element."""
        balances = np.array([200_000, 400_000, 800_000])
        vectorized = vectorized_rmd(balances, 80)
        scalar = [calculate_rmd(b, 80) for b in balances]
        np.testing.assert_allclose(vectorized, scalar)


class TestRmdImpactOnOptimization:
    """Integration tests verifying RMDs change optimization behavior."""

    def test_conversion_reduces_future_rmd(self):
        """Core RMD value prop: converting $100K now means $100K less
        subject to RMDs later."""
        balance_no_conv = 500_000
        balance_after_conv = 400_000  # converted $100K

        rmd_no_conv = calculate_rmd(balance_no_conv, 73)
        rmd_after_conv = calculate_rmd(balance_after_conv, 73)

        reduction = rmd_no_conv - rmd_after_conv
        assert reduction > 0
        # Reduction should be roughly $100K / 26.5 ≈ $3,774
        assert abs(reduction - 100_000 / 26.5) < 1

    def test_large_balance_has_significant_rmd(self):
        """$820K MFJ balance (Priya persona) generates meaningful RMDs."""
        rmd = calculate_rmd(820_000, 73)
        # $820K / 26.5 ≈ $30,943
        assert rmd > 30_000
        assert rmd < 35_000
