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
        assert label == "Converts nearly all of the traditional balance by 2027"

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

    def test_rate_is_blended_when_the_extra_straddles_a_bracket_edge(self):
        # MFJ 24% bracket ends at $403,550 taxable; put $650 of the extra $1,000 below it
        edge = BRACKETS[FilingStatus.MFJ][3]["max"] + STANDARD_DEDUCTION[FilingStatus.MFJ]
        scenario = ScenarioInput(
            age=58,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026, gross_income=140_000)],
            traditional_ira_balance=1_000_000,
        )
        cost = _cost_of_next_bracket(scenario, [edge - 140_000 - 650])
        assert cost["additional_tax"] == pytest.approx(650 * 0.24 + 350 * 0.32, abs=1)
        assert cost["bracket_rate"] == pytest.approx(cost["additional_tax"] / 1000)


class TestEngineNumbersAddUp:
    def test_tax_paid_and_avoided_differ_by_the_savings(self):
        scenario = ScenarioInput(
            age=60,
            filing_status=FilingStatus.MFJ,
            timeline=[PlanYear(year=2026 + t, gross_income=40_000) for t in range(31)],
            traditional_ira_balance=900_000,
            drawdown_start_age=60,
        )
        result = optimize(scenario)
        benefit = result.reasoning_trace.benefit_of_current_bracket
        assert benefit["tax_paid"] == pytest.approx(result.conversion_cost_today, abs=1)
        assert benefit["future_tax_avoided"] - benefit["tax_paid"] == pytest.approx(
            result.estimated_lifetime_tax_savings, abs=1
        )


class TestAcaSummary:
    def test_income_already_over_the_cliff_is_not_a_cliff_year(self):
        from app.engine.types import HealthcareInput

        scenario = ScenarioInput(
            age=58,
            filing_status=FilingStatus.MFJ,
            timeline=[
                *(PlanYear(year=2026 + t, gross_income=140_000) for t in range(2)),
                *(PlanYear(year=2028 + t, gross_income=20_000) for t in range(30)),
            ],
            traditional_ira_balance=1_000_000,
            drawdown_start_age=60,
            default_drawdown=40_000,
            # Marketplace coverage named explicitly, so the high-wage years are ACA years
            healthcare=HealthcareInput(
                household_size=2, aca_coverage_years=list(range(2026, 2033))
            ),
        )
        result = optimize(scenario)
        by_year = {d.year: d for d in result.aca_subsidy_impact}
        assert not by_year[2026].hits_cliff
        assert not by_year[2027].hits_cliff
        summary = result.reasoning_trace.aca_summary
        assert summary["years_hitting_cliff"] == sum(d.hits_cliff for d in by_year.values())
        if summary["total_subsidy_lost"] == 0:
            assert "worst_year_note" not in summary


class TestLabels:
    def test_state_note_names_each_state(self):
        # Texas working years, then Oregon: one note per state, not a blended average
        from app.engine.trace import _build_sensitivity_notes

        scenario = ScenarioInput(
            age=55,
            filing_status=FilingStatus.SINGLE,
            state="TX",
            timeline=[
                *(PlanYear(year=2026 + t, gross_income=95_000) for t in range(3)),
                *(PlanYear(year=2029 + t, gross_income=40_000, state="OR") for t in range(3)),
            ],
            traditional_ira_balance=650_000,
            drawdown_start_age=73,
            planning_horizon_age=90,
        )
        notes = _build_sensitivity_notes(scenario, [20_000.0] * 6)
        assert "Texas adds no state income tax to conversions (2026 to 2028)" in notes
        oregon = next(n for n in notes if n.startswith("Oregon"))
        assert "(2029 to 2031)" in oregon
        assert not any("approximately" in n for n in notes)

    def test_aca_explains_years_with_no_conversions(self):
        from app.engine.trace import _build_aca_summary
        from app.engine.types import AcaSubsidyDetail, HealthcareInput

        scenario = ScenarioInput(
            age=58,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2029 + t, gross_income=60_000) for t in range(2)],
            traditional_ira_balance=500_000,
            drawdown_start_age=58,
            planning_horizon_age=90,
            healthcare=HealthcareInput(household_size=1),
        )
        details = [
            AcaSubsidyDetail(
                year=2029 + t,
                magi_without_conversion=60_000,
                magi_with_conversion=60_000,
                subsidy_without_conversion=2_000,
                subsidy_with_conversion=2_000,
                subsidy_lost=0,
                federal_tax_cost=0,
                combined_cost=0,
                combined_marginal_rate=0,
                income_pct_fpl=383,
                hits_cliff=False,
            )
            for t in range(2)
        ]
        summary = _build_aca_summary(scenario, details, [0.0, 0.0])
        assert summary["explanation"].startswith(
            "No conversions fall in your marketplace years (2029 to 2030)"
        )
        assert "$60,000" in summary["explanation"]


class TestZeroBracketLabel:
    def test_conversion_under_the_standard_deduction_reads_zero(self):
        scenario = ScenarioInput(
            age=60,
            filing_status=FilingStatus.SINGLE,
            timeline=[PlanYear(year=2026, gross_income=0)],
            traditional_ira_balance=8_000,
            drawdown_start_age=73,
            planning_horizon_age=90,
        )
        result = optimize(scenario)
        first = result.yearly_detail[0]
        assert first["conversion"] + first["income"] <= STANDARD_DEDUCTION[FilingStatus.SINGLE]
        assert first["marginal_bracket"] == "0%"
