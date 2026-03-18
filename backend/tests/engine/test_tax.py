"""Tests for the federal tax bracket calculator.

All calculations use 2025 brackets. calculate_federal_tax takes gross income
and subtracts the standard deduction internally.
"""

import pytest

from app.engine.tax import calculate_federal_tax, get_marginal_rate, analyze_bracket_fill
from app.engine.types import FilingStatus


class TestCalculateFederalTax:
    def test_zero_income(self):
        assert calculate_federal_tax(0) == 0

    def test_below_standard_deduction(self):
        """$10K gross < $15K deduction → $0 taxable → $0 tax."""
        assert calculate_federal_tax(10000) == 0

    def test_single_in_10_percent_only(self):
        """$20K gross - $15K deduction = $5K taxable → $5K * 10% = $500."""
        tax = calculate_federal_tax(20000)
        assert abs(tax - 500) < 1

    def test_single_spanning_10_and_12(self):
        """$50K gross - $15K deduction = $35K taxable.
        $11,925 * 10% = $1,192.50
        ($35K - $11,925) * 12% = $2,769.00
        Total: $3,961.50
        """
        tax = calculate_federal_tax(50000)
        assert abs(tax - 3961.50) < 1

    def test_mfj_wider_brackets(self):
        """MFJ: $50K gross - $30K deduction = $20K taxable.
        All in 10% bracket (goes to $23,850 for MFJ).
        $20K * 10% = $2,000.
        """
        tax = calculate_federal_tax(50000, FilingStatus.MFJ)
        assert abs(tax - 2000) < 1

    def test_mfj_spanning_brackets(self):
        """MFJ: $100K gross - $30K deduction = $70K taxable.
        $23,850 * 10% = $2,385
        ($70K - $23,850) * 12% = $5,538
        Total: $7,923
        """
        tax = calculate_federal_tax(100000, FilingStatus.MFJ)
        assert abs(tax - 7923) < 1

    def test_mfj_lower_tax_than_single_at_same_income(self):
        """MFJ brackets are wider — same gross income should yield lower tax."""
        income = 100000
        tax_single = calculate_federal_tax(income, FilingStatus.SINGLE)
        tax_mfj = calculate_federal_tax(income, FilingStatus.MFJ)
        assert tax_mfj < tax_single


class TestGetMarginalRate:
    def test_below_deduction_is_10_percent(self):
        """Income below standard deduction → taxable = 0 → 10% bracket."""
        rate = get_marginal_rate(10000, FilingStatus.SINGLE)
        assert rate == 0.10

    def test_in_12_percent_bracket(self):
        """$50K gross - $15K deduction = $35K taxable → in 12% bracket."""
        rate = get_marginal_rate(50000, FilingStatus.SINGLE)
        assert rate == 0.12

    def test_in_22_percent_bracket(self):
        """$85K gross - $15K deduction = $70K taxable → in 22% bracket."""
        rate = get_marginal_rate(85000, FilingStatus.SINGLE)
        assert rate == 0.22

    def test_mfj_rate_lower_at_same_income(self):
        """MFJ has wider brackets, so marginal rate may be lower."""
        rate_single = get_marginal_rate(100000, FilingStatus.SINGLE)
        rate_mfj = get_marginal_rate(100000, FilingStatus.MFJ)
        assert rate_mfj <= rate_single


class TestBracketFill:
    def test_conversion_fills_brackets(self):
        """$20K income + $40K conversion should fill 10% and spill into 12%."""
        results = analyze_bracket_fill(20000, 40000, FilingStatus.SINGLE)
        assert len(results) >= 2
        assert results[0].filled_by_income > 0
        assert results[0].filled_by_conversion >= 0
        assert results[1].filled_by_conversion > 0

    def test_zero_conversion(self):
        """Zero conversion should show no conversion fill."""
        results = analyze_bracket_fill(50000, 0, FilingStatus.SINGLE)
        for r in results:
            assert r.filled_by_conversion == 0

    def test_bracket_rates_ascending(self):
        """Bracket rates should be in ascending order."""
        results = analyze_bracket_fill(50000, 100000, FilingStatus.SINGLE)
        rates = [r.bracket_rate for r in results]
        assert rates == sorted(rates)
