"""Taxable Social Security, the 65+ deduction and state benefit exemptions."""

import numpy as np
import pytest

from app.engine.optimizer import optimize
from app.engine.tax import calculate_federal_tax
from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.engine.year_tax import YearTax, taxable_social_security, year_tax
from app.tools.draft import IncomeSource, generate_timeline

SINGLE = FilingStatus.SINGLE
MFJ = FilingStatus.MFJ


class TestTaxableSocialSecurity:
    def test_nothing_taxable_under_the_first_threshold(self):
        # Provisional income 10,000 + 10,000 = 20,000, under 25,000
        assert taxable_social_security(10_000, 20_000, SINGLE) == 0

    def test_half_rate_between_thresholds(self):
        # Provisional 30,000: half of the 5,000 over 25,000
        assert taxable_social_security(20_000, 20_000, SINGLE) == pytest.approx(2_500)

    def test_85_rate_over_the_second_threshold(self):
        # Provisional 40,000: 85% of 6,000 over 34,000 plus 4,500
        assert taxable_social_security(30_000, 20_000, SINGLE) == pytest.approx(9_600)

    def test_capped_at_85_percent_of_benefits(self):
        assert taxable_social_security(200_000, 30_000, SINGLE) == pytest.approx(25_500)

    def test_mfj_thresholds(self):
        # Provisional 32,000 + 10,000 = 42,000 for MFJ is in the 50% band
        assert taxable_social_security(32_000, 20_000, MFJ) == pytest.approx(5_000)

    def test_vectorized_matches_scalar(self):
        others = np.array([10_000.0, 20_000.0, 30_000.0, 200_000.0])
        got = taxable_social_security(others, 20_000, SINGLE)
        want = [taxable_social_security(float(o), 20_000, SINGLE) for o in others]
        assert got == pytest.approx(want)


class TestYearTax:
    def test_agi_counts_only_taxable_benefits(self):
        yt = YearTax(SINGLE, social_security=28_000)
        # Other income 32,000, provisional 46,000: 14,700 of benefits taxable
        assert yt.agi(60_000) == pytest.approx(46_700)

    def test_tax_torpedo_conversion_adds_more_than_itself_to_agi(self):
        yt = YearTax(SINGLE, social_security=28_000)
        assert yt.agi(68_000) - yt.agi(60_000) == pytest.approx(14_800)

    def test_no_benefits_is_plain_federal_tax(self):
        yt = YearTax(SINGLE)
        assert yt.federal(80_000) == pytest.approx(calculate_federal_tax(80_000, SINGLE))

    def test_extra_deduction_lowers_tax(self):
        assert YearTax(SINGLE, extra_deduction=2_050).federal(60_000) < YearTax(SINGLE).federal(
            60_000
        )

    def test_oregon_leaves_benefits_out(self):
        yt = YearTax(SINGLE, state="OR", social_security=28_000)
        assert yt.state_income(60_000) == 32_000
        assert yt.state_tax(60_000) == pytest.approx(YearTax(SINGLE, state="OR").state_tax(32_000))

    def test_colorado_taxes_benefits(self):
        yt = YearTax(SINGLE, state="CO", social_security=28_000)
        assert yt.state_income(60_000) == 60_000

    def test_vectorized_federal_matches_scalar(self):
        yt = YearTax(SINGLE, state="OR", social_security=28_000, extra_deduction=2_050)
        incomes = np.array([30_000.0, 60_000.0, 120_000.0])
        assert yt.total(incomes) == pytest.approx([yt.total(float(x)) for x in incomes])


def _scenario(age=66, filing_status=SINGLE, social_security=None, state=None):
    return ScenarioInput(
        age=age,
        filing_status=filing_status,
        timeline=[
            PlanYear(year=2026, gross_income=60_000, social_security=social_security),
        ],
        traditional_ira_balance=300_000,
        drawdown_start_age=age,
        planning_horizon_age=90,
        state=state,
    )


class TestYearTaxForScenario:
    def test_65_and_older_gets_the_extra_deduction(self):
        assert year_tax(_scenario(age=65), 0).extra_deduction == 2_050
        assert year_tax(_scenario(age=64), 0).extra_deduction == 0

    def test_mfj_counts_both_spouses(self):
        assert year_tax(_scenario(filing_status=MFJ), 0).extra_deduction == 3_300

    def test_benefits_capped_at_the_years_income(self):
        assert year_tax(_scenario(social_security=90_000), 0).social_security == 60_000


class TestOptimizerUsesTaxableBenefits:
    def test_benefits_lower_the_rate_on_conversions(self):
        full = optimize(_scenario(state="OR"))
        partial = optimize(_scenario(social_security=28_000, state="OR"))
        rate = lambda r: r.yearly_detail[0]["tax_cost"] / r.yearly_detail[0]["conversion"]  # noqa: E731
        assert rate(partial) < rate(full)
        assert partial.estimated_lifetime_tax_savings > full.estimated_lifetime_tax_savings


def test_timeline_records_social_security_separately():
    sources = [
        IncomeSource(kind="social_security", amount=28_000, start_age=67),
        IncomeSource(kind="pension", amount=10_000, start_age=66),
    ]
    rows = generate_timeline(65, 60, 0, 0, 2026, 68, sources)
    assert [r.gross_income for r in rows] == [0, 10_000, 38_000, 38_000]
    assert [r.social_security for r in rows] == [None, None, 28_000, 28_000]
