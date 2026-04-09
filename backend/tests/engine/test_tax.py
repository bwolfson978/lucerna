"""Tests for the federal tax bracket calculator.

All calculations use 2026 brackets. calculate_federal_tax takes gross income
and subtracts the standard deduction internally.
"""

import pytest

from app.engine.tax import calculate_federal_tax, get_marginal_rate, analyze_bracket_fill
from app.engine.types import FilingStatus


class TestCalculateFederalTax:
    def test_zero_income(self):
        assert calculate_federal_tax(0) == 0

    def test_below_standard_deduction(self):
        """$10K gross < $16,100 deduction → $0 taxable → $0 tax."""
        assert calculate_federal_tax(10000) == 0

    def test_single_in_10_percent_only(self):
        """$20K gross - $16,100 deduction = $3,900 taxable → $3,900 * 10% = $390."""
        tax = calculate_federal_tax(20000)
        assert abs(tax - 390) < 1

    def test_single_spanning_10_and_12(self):
        """$50K gross - $16,100 deduction = $33,900 taxable.
        $12,400 * 10% = $1,240
        ($33,900 - $12,400) * 12% = $2,580
        Total: $3,820
        """
        tax = calculate_federal_tax(50000)
        assert abs(tax - 3820) < 1

    def test_mfj_wider_brackets(self):
        """MFJ: $50K gross - $32,200 deduction = $17,800 taxable.
        All in 10% bracket (goes to $24,800 for MFJ).
        $17,800 * 10% = $1,780.
        """
        tax = calculate_federal_tax(50000, FilingStatus.MFJ)
        assert abs(tax - 1780) < 1

    def test_mfj_spanning_brackets(self):
        """MFJ: $100K gross - $32,200 deduction = $67,800 taxable.
        $24,800 * 10% = $2,480
        ($67,800 - $24,800) * 12% = $5,160
        Total: $7,640
        """
        tax = calculate_federal_tax(100000, FilingStatus.MFJ)
        assert abs(tax - 7640) < 1

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
        """$50K gross - $16,100 deduction = $33,900 taxable → in 12% bracket."""
        rate = get_marginal_rate(50000, FilingStatus.SINGLE)
        assert rate == 0.12

    def test_in_22_percent_bracket(self):
        """$85K gross - $16,100 deduction = $68,900 taxable → in 22% bracket."""
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
