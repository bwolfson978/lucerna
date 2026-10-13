"""Tests for the reasoning trace generator."""

import pytest

from app.engine.irmaa import IRMAA_TIERS
from app.engine.optimizer import optimize
from app.engine.tax import BRACKETS, STANDARD_DEDUCTION, analyze_bracket_fill
from app.engine.trace import (
    _cost_of_next_bracket,
    _find_binding_constraint,
    generate_reasoning_trace,
)
from app.engine.types import (
    FilingStatus,
    NPVCurvePoint,
    PlanYear,
    ReasoningTrace,
    ScenarioInput,
)


class TestGenerateReasoningTrace:
    def _make_scenario(self):
        return ScenarioInput(
            age=45,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=50000)],
            traditional_ira_balance=250000,
            drawdown_start_age=65,
            planning_horizon_age=90,
            annual_growth_rate=0.07,
            discount_rate=0.05,
        )

    def test_returns_reasoning_trace(self):
        scenario = self._make_scenario()
        conversions = [30000.0]
        bracket_fill = [analyze_bracket_fill(50000, 30000, FilingStatus.SINGLE)]
        npv_curve = [
            NPVCurvePoint(conversion_amount=0, npv=100000),
            NPVCurvePoint(conversion_amount=30000, npv=110000),
        ]
        trace = generate_reasoning_trace(scenario, conversions, bracket_fill, npv_curve)
        assert isinstance(trace, ReasoningTrace)

    def test_trace_has_binding_constraint(self):
        scenario = self._make_scenario()
        conversions = [30000.0]
        bracket_fill = [analyze_bracket_fill(50000, 30000, FilingStatus.SINGLE)]
        npv_curve = [
            NPVCurvePoint(conversion_amount=0, npv=100000),
            NPVCurvePoint(conversion_amount=30000, npv=110000),
        ]
        trace = generate_reasoning_trace(scenario, conversions, bracket_fill, npv_curve)
        assert len(trace.binding_constraint) > 0

    def test_trace_has_summary_points(self):
        scenario = self._make_scenario()
        conversions = [30000.0]
        bracket_fill = [analyze_bracket_fill(50000, 30000, FilingStatus.SINGLE)]
        npv_curve = [
            NPVCurvePoint(conversion_amount=0, npv=100000),
            NPVCurvePoint(conversion_amount=30000, npv=110000),
        ]
        trace = generate_reasoning_trace(scenario, conversions, bracket_fill, npv_curve)
        assert "what_to_convert" in trace.summary_points
        assert "why_this_amount" in trace.summary_points
        assert "how_much_you_save" in trace.summary_points

    def test_trace_sensitivity_notes_not_empty(self):
        scenario = self._make_scenario()
        conversions = [30000.0]
        bracket_fill = [analyze_bracket_fill(50000, 30000, FilingStatus.SINGLE)]
        npv_curve = [
            NPVCurvePoint(conversion_amount=0, npv=100000),
            NPVCurvePoint(conversion_amount=30000, npv=110000),
        ]
        trace = generate_reasoning_trace(scenario, conversions, bracket_fill, npv_curve)
        assert isinstance(trace.sensitivity_notes, list)
        assert len(trace.sensitivity_notes) > 0


class TestLifetimeSavings:
    def _scenario(self):
        return TestGenerateReasoningTrace()._make_scenario()

    def test_summary_uses_passed_lifetime_savings(self):
        scenario = self._scenario()
        npv_curve = [
            NPVCurvePoint(conversion_amount=0, npv=100000),
            NPVCurvePoint(conversion_amount=30000, npv=110000),
        ]
        trace = generate_reasoning_trace(
            scenario,
            [30000.0],
            [analyze_bracket_fill(50000, 30000, FilingStatus.SINGLE)],
            npv_curve,
            lifetime_savings=42_000,
        )
        assert trace.marginal_benefit_at_optimal == 42_000
        assert "$42,000" in trace.summary_points["how_much_you_save"]

    def test_optimizer_summary_matches_headline(self):
        # Multi-year plan: the year-one-only NPV curve used to give a different number.
        scenario = ScenarioInput(
            age=63,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026 + t, gross_income=20000) for t in range(4)],
            traditional_ira_balance=1_400_000,
            drawdown_start_age=73,
            planning_horizon_age=93,
            default_drawdown=95_000,
        )
        result = optimize(scenario)
        assert result.reasoning_trace.marginal_benefit_at_optimal == pytest.approx(
            result.estimated_lifetime_tax_savings, abs=0.01
        )
        expected = f"${abs(result.estimated_lifetime_tax_savings):,.0f}"
        assert expected in result.reasoning_trace.summary_points["how_much_you_save"]


class TestBindingConstraint:
    def _scenario(self, age=45, filing_status=FilingStatus.SINGLE, income=50000, years=1):
        return ScenarioInput(
            age=age,
            filing_status=filing_status,
            timeline=[PlanYear(year=2026 + t, gross_income=income) for t in range(years)],
            traditional_ira_balance=2_000_000,
            drawdown_start_age=73,
            planning_horizon_age=90,
        )

    def _top_of_bracket_gross(self, filing_status, rate):
        bracket = next(b for b in BRACKETS[filing_status] if b["rate"] == rate)
        return bracket["max"] + STANDARD_DEDUCTION[filing_status]

    def test_stopping_mid_bracket_names_that_bracket(self):
        # Fills 12% completely, then stops partway into 22%. The old label said "Top of 12%".
        scenario = self._scenario(income=20000, years=3)
        gross = self._top_of_bracket_gross(FilingStatus.SINGLE, 0.12) + 20_000
        conversion = gross - 20000
        fills = [analyze_bracket_fill(20000, conversion, FilingStatus.SINGLE)] * 3
        label = _find_binding_constraint(scenario, [conversion] * 3, fills)
        assert label.startswith("Partway into 22% bracket in 3 years")

    def test_stopping_at_bracket_edge(self):
        scenario = self._scenario(income=20000)
        conversion = self._top_of_bracket_gross(FilingStatus.SINGLE, 0.12) - 20000
        fills = [analyze_bracket_fill(20000, conversion, FilingStatus.SINGLE)]
        assert _find_binding_constraint(scenario, [conversion], fills) == "Top of 12% bracket"

    def test_stopping_under_irmaa_threshold(self):
        scenario = self._scenario(age=64, filing_status=FilingStatus.MFJ, income=20000)
        first_tier = IRMAA_TIERS[0]["mfj_max"]
        conversion = first_tier - 20000 - 1_000
        fills = [analyze_bracket_fill(20000, conversion, FilingStatus.MFJ)]
        label = _find_binding_constraint(scenario, [conversion], fills)
        assert label == "Just under the Medicare surcharge (IRMAA) threshold"

    def test_irmaa_ignored_before_lookback_age(self):
        scenario = self._scenario(age=50, filing_status=FilingStatus.MFJ, income=20000)
        conversion = IRMAA_TIERS[0]["mfj_max"] - 20000 - 1_000
        fills = [analyze_bracket_fill(20000, conversion, FilingStatus.MFJ)]
        label = _find_binding_constraint(scenario, [conversion], fills)
        assert "Medicare" not in label

    def test_growth_left_behind_is_not_fully_converted(self):
        # Conversions add up to more than today's balance only because it grew in
        # between; money is still left. The old check compared the sum to today's balance.
        scenario = self._scenario(income=20000, years=3).model_copy(
            update={"traditional_ira_balance": 100_000, "annual_growth_rate": 0.07}
        )
        conversions = [40_000.0, 40_000.0, 20_000.0]
        fills = [analyze_bracket_fill(20000, c, FilingStatus.SINGLE) for c in conversions]
        label = _find_binding_constraint(scenario, conversions, fills)
        assert label != "Traditional IRA balance fully converted"

    def test_whole_balance_converted(self):
        scenario = self._scenario(income=20000, years=2).model_copy(
            update={"traditional_ira_balance": 100_000, "annual_growth_rate": 0.07}
        )
        conversions = [50_000.0, 53_500.0]
        fills = [analyze_bracket_fill(20000, c, FilingStatus.SINGLE) for c in conversions]
        label = _find_binding_constraint(scenario, conversions, fills)
        assert label == "Traditional IRA balance fully converted"

    def test_rounding_spill_counts_as_top_of_lower_bracket(self):
        # A conversion rounded to $100 can land a few dollars into the next bracket.
        scenario = self._scenario(income=20000)
        conversion = self._top_of_bracket_gross(FilingStatus.SINGLE, 0.12) - 20000 + 40
        fills = [analyze_bracket_fill(20000, conversion, FilingStatus.SINGLE)]
        assert _find_binding_constraint(scenario, [conversion], fills) == "Top of 12% bracket"


class TestCostOfNextBracket:
    def test_prices_one_extra_thousand_in_one_year(self):
        # It used to add $1,000 to every timeline year and report the sum.
        scenario = ScenarioInput(
            age=25,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026 + t, gross_income=100_000) for t in range(30)],
            traditional_ira_balance=400_000,
            drawdown_start_age=55,
            planning_horizon_age=90,
        )
        conversions = [50_000.0] + [0.0] * 29
        cost = _cost_of_next_bracket(scenario, conversions)
        assert cost["additional_tax"] == pytest.approx(240, abs=1)
        assert cost["net_effect"].startswith("Converting $1,000 more in 2026 would cost $240")
