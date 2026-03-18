"""Tests for the greedy bracket-fill heuristic."""

import pytest

from app.engine.heuristic import greedy_bracket_fill
from app.engine.types import ScenarioInput, FilingStatus, YearlyIncome


class TestGreedyBracketFill:
    def test_returns_one_amount_per_year(self):
        """Should return exactly one conversion amount per year in trajectory."""
        scenario = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=210000,
        )
        result = greedy_bracket_fill(scenario)
        assert len(result) == 3

    def test_low_income_years_get_more_conversion(self):
        """Conversions should be larger in low-income years."""
        scenario = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=150000),
            ],
            traditional_ira_balance=210000,
        )
        result = greedy_bracket_fill(scenario)
        assert result[0] > result[1]

    def test_conversions_non_negative(self):
        """All conversion amounts should be >= 0."""
        scenario = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
            ],
            traditional_ira_balance=210000,
        )
        result = greedy_bracket_fill(scenario)
        for c in result:
            assert c >= 0

    def test_total_does_not_exceed_balance(self):
        """Total conversions should not exceed the traditional IRA balance."""
        scenario = ScenarioInput(
            age=38, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=35000),
                YearlyIncome(year=2027, gross_income=30000),
                YearlyIncome(year=2028, gross_income=150000),
            ],
            traditional_ira_balance=50000,
        )
        result = greedy_bracket_fill(scenario)
        assert sum(result) <= 50000 + 1  # +1 for float tolerance

    def test_single_year_trajectory(self):
        """Single-year trajectory should return a single amount."""
        scenario = ScenarioInput(
            age=45, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=25000),
            ],
            traditional_ira_balance=100000,
        )
        result = greedy_bracket_fill(scenario)
        assert len(result) == 1
        assert result[0] > 0

    def test_high_income_gets_minimal_conversion(self):
        """Very high income should result in little or no conversion."""
        scenario = ScenarioInput(
            age=45, filing_status=FilingStatus.SINGLE,
            income_trajectory=[
                YearlyIncome(year=2026, gross_income=500000),
            ],
            traditional_ira_balance=100000,
        )
        result = greedy_bracket_fill(scenario)
        assert result[0] == 0
