"""The traditional withdrawal that funds spending counts toward a year's income."""

import pytest

from app.engine.irmaa import calculate_irmaa
from app.engine.optimizer import optimize
from app.engine.tax import calculate_federal_tax
from app.engine.types import FilingStatus, HealthcareInput, PlanYear, ScenarioInput


def _gap_years(healthcare=None, spending=60_000, age=60, balance=800_000):
    """Retired at 60 with no outside income until a pension at 65."""
    return ScenarioInput(
        age=age,
        filing_status=FilingStatus.MFJ,
        timeline=[
            PlanYear(year=2026 + t, gross_income=0 if age + t < 65 else 30_000)
            for t in range(90 - age + 1)
        ],
        traditional_ira_balance=balance,
        drawdown_start_age=age,
        default_drawdown=spending,
        healthcare=healthcare,
    )


def test_year_detail_shows_where_spending_comes_from():
    result = optimize(_gap_years())
    first = result.yearly_detail[0]
    assert first["income"] == 0
    assert first["spending_from_traditional"] == pytest.approx(60_000)
    assert first["spending_from_roth"] == 0


def test_conversion_is_taxed_on_top_of_the_withdrawal():
    result = optimize(_gap_years())
    first = result.yearly_detail[0]
    conversion = first["conversion"]
    assert conversion > 0
    fs = FilingStatus.MFJ
    expected = calculate_federal_tax(60_000 + conversion, fs) - calculate_federal_tax(60_000, fs)
    assert first["federal_tax_cost"] == pytest.approx(expected, abs=1)


def test_aca_income_includes_the_withdrawal():
    result = optimize(_gap_years(healthcare=HealthcareInput(household_size=2)))
    first = result.aca_subsidy_impact[0]
    assert first.magi_without_conversion == pytest.approx(60_000)
    assert first.subsidy_without_conversion > 0


def test_irmaa_income_includes_the_withdrawal():
    # Spending large enough that the withdrawal alone crosses the first IRMAA tier
    result = optimize(_gap_years(spending=250_000, age=64, balance=3_000_000))
    projection = result.irmaa_projection_no_conversion
    assert projection is not None
    first = projection.yearly_detail[0]
    assert first.magi >= 250_000
    assert first.irmaa_annual_cost == calculate_irmaa(first.magi, FilingStatus.MFJ)


def test_default_aca_years_skip_income_over_the_cliff():
    scenario = ScenarioInput(
        age=58,
        filing_status=FilingStatus.MFJ,
        timeline=[
            *(PlanYear(year=2026 + t, gross_income=140_000) for t in range(4)),
            *(PlanYear(year=2030 + t, gross_income=20_000) for t in range(29)),
        ],
        traditional_ira_balance=500_000,
        drawdown_start_age=62,
        default_drawdown=40_000,
        healthcare=HealthcareInput(household_size=2),
    )
    result = optimize(scenario)
    assert [d.year for d in result.aca_subsidy_impact] == [2030, 2031, 2032]
