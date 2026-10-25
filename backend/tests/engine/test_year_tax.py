"""Taxable Social Security, the 65+ deductions and state benefit exemptions."""

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

    def test_a_younger_spouse_counts_from_their_own_65th(self):
        scenario = _scenario(filing_status=MFJ).model_copy(update={"spouse_age": 60})
        yt = year_tax(scenario, 0)
        assert (yt.extra_deduction, yt.senior_bonus_people) == (1_650, 1)
        # Medicare (and IRMAA) two years on: only the user is 65 or older by then
        assert yt.medicare_people == 1
        older = _scenario(age=60, filing_status=MFJ).model_copy(update={"spouse_age": 63})
        assert year_tax(older, 0).medicare_people == 1
        assert year_tax(_scenario(age=60, filing_status=MFJ), 0).medicare_people == 0

    def test_senior_deduction_for_65_and_older_through_2028(self):
        assert year_tax(_scenario(age=65), 0).senior_bonus_people == 1
        assert year_tax(_scenario(age=64), 0).senior_bonus_people == 0
        assert year_tax(_scenario(filing_status=MFJ), 0).senior_bonus_people == 2

    def test_senior_deduction_ends_after_2028(self):
        scenario = _scenario(age=64).model_copy(
            update={
                "timeline": [PlanYear(year=2026 + t, gross_income=60_000) for t in range(5)],
            }
        )
        got = [year_tax(scenario, t).senior_bonus_people for t in range(5)]
        # Turns 65 in 2027; the deduction ends after 2028
        assert got == [0, 1, 1, 0, 0]

    def test_benefits_capped_at_the_years_income(self):
        assert year_tax(_scenario(social_security=90_000), 0).social_security == 60_000


class TestSeniorDeduction:
    def test_full_6000_under_the_phase_out(self):
        yt = YearTax(SINGLE, senior_bonus_people=1)
        assert yt.senior_deduction(75_000) == 6_000
        assert yt.federal(60_000) == pytest.approx(calculate_federal_tax(54_000, SINGLE))

    def test_cut_by_6_percent_of_magi_over_75000(self):
        # 6,000 - 6% of the 25,000 over 75,000
        assert YearTax(SINGLE, senior_bonus_people=1).senior_deduction(100_000) == pytest.approx(
            4_500
        )

    def test_gone_at_175000_single(self):
        assert YearTax(SINGLE, senior_bonus_people=1).senior_deduction(175_000) == 0
        assert YearTax(SINGLE, senior_bonus_people=1).senior_deduction(400_000) == 0

    def test_mfj_cuts_each_spouses_6000(self):
        yt = YearTax(MFJ, senior_bonus_people=2)
        assert yt.senior_deduction(150_000) == 12_000
        # Each spouse's 6,000 loses 6% of the 50,000 over 150,000
        assert yt.senior_deduction(200_000) == pytest.approx(6_000)
        assert yt.senior_deduction(250_000) == 0

    def test_phase_out_uses_agi_not_full_benefits(self):
        yt = YearTax(SINGLE, social_security=28_000, senior_bonus_people=1)
        # Engine income 60,000 is AGI 46,700, under the threshold
        assert yt.senior_deduction(yt.agi(60_000)) == 6_000

    def test_conversion_in_the_phase_out_costs_more_than_its_bracket(self):
        yt = YearTax(SINGLE, senior_bonus_people=1)
        # 1,000 more income also takes 60 off the deduction, in the 22% bracket
        cost = yt.federal(101_000) - yt.federal(100_000)
        assert cost == pytest.approx(0.22 * 1_060)

    def test_fixed_in_law_so_it_shrinks_with_inflation(self):
        yt = YearTax(SINGLE, senior_bonus_people=1, fixed_scale=0.9)
        assert yt.senior_deduction(0) == pytest.approx(5_400)
        assert yt.senior_deduction(77_500) == pytest.approx(5_400 - 0.06 * 10_000)

    def test_vectorized_matches_scalar(self):
        yt = YearTax(MFJ, social_security=40_000, extra_deduction=3_300, senior_bonus_people=2)
        incomes = np.array([30_000.0, 160_000.0, 210_000.0, 300_000.0])
        assert yt.federal(incomes) == pytest.approx([yt.federal(float(x)) for x in incomes])


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
