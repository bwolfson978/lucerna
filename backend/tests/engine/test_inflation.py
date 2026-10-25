"""Inflation: amounts in today's dollars, real rates, and thresholds fixed in law."""

import numpy as np
import pytest

from app.engine.inflation import fixed_dollar_scale, nominal_scale, real_rate
from app.engine.irmaa import calculate_irmaa, lookback_threshold_scale
from app.engine.optimizer import optimize
from app.engine.retirement import terminal_value
from app.engine.state_tax import (
    calculate_state_tax,
    retirement_exclusion,
    vectorized_state_tax,
)
from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.engine.year_tax import taxable_social_security, year_tax
from app.tools.draft import ScenarioDraft, build_scenario_input, sync_timeline

SINGLE = FilingStatus.SINGLE


def scenario(**overrides) -> ScenarioInput:
    values = dict(
        age=60,
        filing_status=SINGLE,
        timeline=[PlanYear(year=2026 + t, gross_income=50_000) for t in range(5)],
        traditional_ira_balance=300_000,
    )
    return ScenarioInput(**{**values, **overrides})


class TestRates:
    def test_real_rate(self):
        assert real_rate(0.07, 0.025) == pytest.approx(0.043902, abs=1e-6)

    def test_scales(self):
        assert fixed_dollar_scale(0.025, 10) == pytest.approx(1.025**-10)
        assert nominal_scale(0.025, 10) * fixed_dollar_scale(0.025, 10) == pytest.approx(1)

    def test_no_inflation_keeps_the_quoted_rates(self):
        s = scenario()
        assert s.inflation_rate == 0
        assert s.real_growth_rate == s.annual_growth_rate
        assert s.real_discount_rate == s.discount_rate
        assert s.fixed_dollar_scale(20) == 1

    def test_inflation_turns_quoted_rates_into_real_ones(self):
        s = scenario(inflation_rate=0.025)
        assert s.real_growth_rate == pytest.approx(1.07 / 1.025 - 1)
        assert s.real_discount_rate == pytest.approx(1.05 / 1.025 - 1)


class TestFixedThresholds:
    def test_social_security_thresholds_shrink(self):
        # Thresholds 25,000 / 34,000 worth half: 12,500 / 17,000. Provisional 30,000:
        # 85% of 13,000 over 17,000 plus half the 4,500 band
        assert taxable_social_security(20_000, 20_000, SINGLE, 0.5) == pytest.approx(13_300)
        assert taxable_social_security(20_000, 20_000, SINGLE) == pytest.approx(2_500)

    def test_year_tax_carries_the_years_scale(self):
        s = scenario(inflation_rate=0.025)
        assert year_tax(s, 0).fixed_scale == 1
        assert year_tax(s, 4).fixed_scale == pytest.approx(1.025**-4)

    def test_unindexed_state_brackets_creep(self):
        # New York doesn't index its brackets or deduction: the same real income pays more
        later = calculate_state_tax(100_000, "NY", SINGLE, None, 0.8)
        assert later > calculate_state_tax(100_000, "NY", SINGLE)

    def test_indexed_state_brackets_hold(self):
        # California indexes both: the same real income pays the same
        assert calculate_state_tax(100_000, "CA", SINGLE, None, 0.8) == pytest.approx(
            calculate_state_tax(100_000, "CA", SINGLE)
        )

    def test_vectorized_state_tax_matches_scalar(self):
        incomes = np.array([20_000.0, 80_000.0, 300_000.0])
        got = vectorized_state_tax(incomes, "NY", SINGLE, None, 0.7)
        want = [calculate_state_tax(float(i), "NY", SINGLE, None, 0.7) for i in incomes]
        assert got == pytest.approx(want)

    def test_fixed_retirement_exclusions_shrink(self):
        # New York's $20,000 is fixed in statute; Michigan indexes its amount
        assert retirement_exclusion("NY", SINGLE, 65, 30_000, 0, 0.5) == pytest.approx(10_000)
        assert retirement_exclusion("MI", SINGLE, 65, 100_000, 0, 0.5) == pytest.approx(65_897)

    def test_fixed_phaseouts_shrink(self):
        # Connecticut's single phase-out, 75,000 to 100,000, worth half: 37,500 to 50,000
        assert retirement_exclusion("CT", SINGLE, 65, 10_000, 43_750, 0.5) == pytest.approx(5_000)
        assert retirement_exclusion("CT", SINGLE, 65, 10_000, 43_750) == pytest.approx(10_000)


class TestIrmaaLookback:
    def test_tiers_two_years_later_sit_higher(self):
        # 2026 MAGI just over the first single tier is compared with the 2028 tiers
        assert calculate_irmaa(110_000, SINGLE) > 0
        assert calculate_irmaa(110_000, SINGLE, lookback_threshold_scale(0.025)) == 0
        assert lookback_threshold_scale(0) == 1


class TestTerminalValue:
    def test_left_over_balances_are_discounted_at_the_real_rate(self):
        s = scenario(inflation_rate=0.025)
        assert terminal_value(s, 0, 100, 1) == pytest.approx(100 / (1.05 / 1.025))


class TestEndToEnd:
    def test_raises_less_inflation_keep_a_modest_earner_out_of_irmaa(self):
        """Bug #3: 3% raises compounded against frozen 2026 tables pushed a $70K earner
        into the 24% bracket and IRMAA. With inflation, real pay grows about 0.5% a year."""
        draft = ScenarioDraft(
            birth_year=1986,
            birth_month=6,
            filing_status="single",
            current_income=70_000,
            traditional_balance=150_000,
            retirement_age=65,
        )
        sync_timeline(draft, None, 2026)
        s = build_scenario_input(draft)
        assert s.inflation_rate == pytest.approx(0.025)
        assert s.timeline[24].gross_income < 80_000

        result = optimize(s)
        for projection in (result.irmaa_projection, result.irmaa_projection_no_conversion):
            assert projection is None or projection.total_irmaa_cost == 0
        assert max(int(d["marginal_bracket"].rstrip("%")) for d in result.yearly_detail) <= 22
