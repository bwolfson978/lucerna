"""State exemptions for IRA and 401(k) income: withdrawals and Roth conversions."""

import numpy as np
import pytest

from app.engine.optimizer import optimize
from app.engine.retirement import withdrawal_tax
from app.engine.state_tax import calculate_state_tax, retirement_exclusion, retirement_rule
from app.engine.tax import calculate_federal_tax
from app.engine.tax_cost import combined_marginal_rate, state_tax_on_conversion
from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.engine.year_tax import YearTax, year_tax

SINGLE = FilingStatus.SINGLE
MFJ = FilingStatus.MFJ


def _year(state: str, age: float, wages: float = 50_000, **kw) -> YearTax:
    return YearTax(
        filing_status=kw.pop("fs", SINGLE), state=state, other_income=wages, age=age, **kw
    )


class TestFullExemption:
    def test_illinois_taxes_wages_but_not_ira_money(self):
        yt = _year("IL", 48)
        assert yt.state_tax(50_000) == pytest.approx(50_000 * 0.0495)
        # A $100,000 conversion on top adds no Illinois tax
        assert yt.state_tax(150_000) == pytest.approx(yt.state_tax(50_000))

    def test_illinois_conversion_cost_is_zero(self):
        yt = _year("IL", 48)
        assert state_tax_on_conversion(50_000, 100_000, "IL", SINGLE, year=yt) == 0

    def test_marginal_rate_is_federal_only(self):
        yt = _year("IL", 48)
        rate = combined_marginal_rate(50_000, 30_000, SINGLE, state="IL", year=yt)
        assert rate == pytest.approx(yt.federal_bracket(80_000))

    def test_iowa_needs_age_55(self):
        assert _year("IA", 54).state_tax(150_000) > _year("IA", 54).state_tax(50_000)
        assert _year("IA", 55).state_tax(150_000) == pytest.approx(
            _year("IA", 55).state_tax(50_000)
        )

    def test_vectorized_matches_scalar(self):
        yt = _year("IL", 48)
        incomes = np.array([20_000.0, 50_000.0, 80_000.0, 200_000.0])
        assert yt.state_tax(incomes) == pytest.approx([yt.state_tax(float(i)) for i in incomes])

    def test_without_other_income_nothing_is_exempt(self):
        # A YearTax built without the year's income split taxes everything, as before
        yt = YearTax(filing_status=SINGLE, state="IL")
        assert yt.state_tax(100_000) == pytest.approx(100_000 * 0.0495)


class TestCappedExclusion:
    def test_new_york_20000_from_59_and_a_half(self):
        under = _year("NY", 59)
        over = _year("NY", 60)
        assert over.state_income(150_000) == pytest.approx(130_000)
        assert under.state_income(150_000) == pytest.approx(150_000)

    def test_new_york_exclusion_never_exceeds_ira_income(self):
        assert _year("NY", 65).state_income(60_000) == pytest.approx(50_000)

    def test_new_york_cap_counted_once_for_couples(self):
        assert _year("NY", 65, fs=MFJ).state_income(150_000) == pytest.approx(130_000)

    def test_georgia_tiers_by_age(self):
        assert _year("GA", 61).state_income(150_000) == pytest.approx(150_000)
        assert _year("GA", 63).state_income(150_000) == pytest.approx(115_000)
        assert _year("GA", 66).state_income(150_000) == pytest.approx(85_000)

    def test_michigan_amount_by_filing_status(self):
        assert _year("MI", 62).state_income(150_000) == pytest.approx(150_000 - 65_897)
        assert _year("MI", 62, fs=MFJ).state_income(250_000) == pytest.approx(250_000 - 131_794)

    def test_kentucky_has_no_age_test(self):
        assert _year("KY", 40).state_income(150_000) == pytest.approx(150_000 - 31_110)


class TestPhaseout:
    def test_connecticut_full_under_75000(self):
        yt = _year("CT", 50, wages=20_000)
        assert yt.state_income(70_000) == pytest.approx(20_000)

    def test_connecticut_halfway_through_phaseout(self):
        # AGI 87,500 is halfway from 75,000 to 100,000: half the IRA money is exempt
        yt = _year("CT", 50, wages=20_000)
        assert yt.state_income(87_500) == pytest.approx(87_500 - 0.5 * 67_500)

    def test_connecticut_gone_above_100000(self):
        yt = _year("CT", 50, wages=20_000)
        assert yt.state_income(120_000) == pytest.approx(120_000)

    def test_phaseout_vectorized(self):
        got = retirement_exclusion(
            "CT", SINGLE, 50, np.array([50_000.0, 50_000.0]), np.array([70_000.0, 90_000.0])
        )
        assert got == pytest.approx([50_000, 20_000])


class TestOtherRules:
    def test_state_without_rule_taxes_ira_money(self):
        assert retirement_rule("CA") is None
        yt = _year("CA", 70)
        assert yt.state_income(150_000) == 150_000

    def test_social_security_still_exempt_alongside_ira_rule(self):
        # 30,000 benefits inside 50,000 of other income; NY exempts benefits and 20,000 of IRA money
        yt = _year("NY", 70, social_security=30_000)
        assert yt.state_income(150_000) == pytest.approx(100_000)

    def test_post_timeline_withdrawal_uses_retirement_state_rule(self):
        scenario = ScenarioInput(
            age=60,
            filing_status=SINGLE,
            timeline=[PlanYear(year=2026, gross_income=0)],
            traditional_ira_balance=500_000,
            drawdown_start_age=60,
            state="CA",
            retirement_state="IL",
        )
        assert withdrawal_tax(scenario, 80_000) == pytest.approx(
            calculate_federal_tax(80_000, SINGLE)
        )
        ny = scenario.model_copy(update={"retirement_state": "NY"})
        assert withdrawal_tax(ny, 80_000) == pytest.approx(
            calculate_federal_tax(80_000, SINGLE) + calculate_state_tax(60_000, "NY", SINGLE)
        )


def _scenario(state: str | None, age: int = 55) -> ScenarioInput:
    return ScenarioInput(
        age=age,
        filing_status=SINGLE,
        timeline=[
            PlanYear(year=2026 + t, gross_income=90_000 if t < 3 else 15_000) for t in range(8)
        ],
        traditional_ira_balance=600_000,
        drawdown_start_age=age + 8,
        planning_horizon_age=90,
        state=state,
    )


class TestOptimizer:
    def test_year_tax_carries_the_split(self):
        yt = year_tax(_scenario("IL"), 2)
        assert yt.other_income == 90_000
        assert yt.age == 57

    @pytest.mark.slow
    def test_illinois_schedule_matches_federal_only(self):
        # Illinois taxes only the wages, the same in every plan, so its best
        # conversions are the federal-only ones and no Illinois tax is charged on them
        il = optimize(_scenario("IL"))
        fed = optimize(_scenario(None))
        assert il.yearly_conversions == pytest.approx(fed.yearly_conversions, abs=1)
        assert il.total_tax_on_conversions == pytest.approx(fed.total_tax_on_conversions, abs=1)

    @pytest.mark.slow
    def test_new_york_exclusion_lowers_conversion_tax(self, monkeypatch):
        result = optimize(_scenario("NY", age=60))
        notes = " ".join(result.reasoning_trace.sensitivity_notes)
        assert "New York exempts up to $20,000" in notes

        monkeypatch.setattr("app.engine.state_tax.retirement_rule", lambda state: None)
        without = optimize(_scenario("NY", age=60))
        assert result.total_tax_on_conversions < without.total_tax_on_conversions
