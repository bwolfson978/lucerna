"""Tests for the reasoning trace generator."""

from app.engine.tax import analyze_bracket_fill
from app.engine.trace import generate_reasoning_trace
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
