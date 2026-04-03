"""Tests for the dynamic programming optimizer."""

import numpy as np
import pytest

from app.engine.dp import dp_optimize, extract_conversion_curve, _compute_retirement_values
from app.engine.optimizer import calculate_npv
from app.engine.tax import vectorized_federal_tax, calculate_federal_tax
from app.engine.types import ScenarioInput, FilingStatus, YearlyIncome


# ── Fixtures ──────────────────────────────────────────────────────────

def _simple_scenario(
    balance: float = 100_000,
    incomes: list[float] | None = None,
    **kwargs,
) -> ScenarioInput:
    if incomes is None:
        incomes = [40_000, 35_000, 150_000]
    return ScenarioInput(
        age=40,
        filing_status=FilingStatus.SINGLE,
        income_trajectory=[
            YearlyIncome(year=2026 + i, gross_income=inc)
            for i, inc in enumerate(incomes)
        ],
        traditional_ira_balance=balance,
        roth_ira_balance=0,
        retirement_age=65,
        years_in_retirement=25,
        annual_growth_rate=0.07,
        discount_rate=0.05,
        **kwargs,
    )


# ── Vectorized tax tests ─────────────────────────────────────────────

class TestVectorizedTax:
    def test_matches_scalar(self):
        """Vectorized tax must match scalar for every test value."""
        incomes = np.array([0, 10_000, 50_000, 100_000, 200_000, 500_000])
        vec_taxes = vectorized_federal_tax(incomes, FilingStatus.SINGLE)
        for i, inc in enumerate(incomes):
            scalar = calculate_federal_tax(float(inc), FilingStatus.SINGLE)
            assert abs(vec_taxes[i] - scalar) < 0.01, (
                f"Mismatch at income={inc}: vec={vec_taxes[i]}, scalar={scalar}"
            )

    def test_mfj(self):
        incomes = np.array([0, 50_000, 200_000, 500_000])
        vec_taxes = vectorized_federal_tax(incomes, FilingStatus.MFJ)
        for i, inc in enumerate(incomes):
            scalar = calculate_federal_tax(float(inc), FilingStatus.MFJ)
            assert abs(vec_taxes[i] - scalar) < 0.01


# ── Core DP tests ────────────────────────────────────────────────────

class TestDPOptimize:
    def test_zero_balance(self):
        """Zero balance should produce zero conversions."""
        scenario = _simple_scenario(balance=0)
        result = dp_optimize(scenario)
        assert result.total_conversion == 0
        assert all(c == 0 for c in result.yearly_conversions)

    def test_basic_finds_conversions(self):
        """DP should find positive conversions when low-income years exist."""
        scenario = _simple_scenario(balance=100_000, incomes=[30_000, 35_000, 150_000])
        result = dp_optimize(scenario)
        assert result.total_conversion > 0
        # Should convert in low-income years, not the high-income year
        assert result.yearly_conversions[0] > 0 or result.yearly_conversions[1] > 0
        assert result.yearly_conversions[2] == 0  # $150K year — no conversion

    def test_npv_beats_no_conversion(self):
        """Optimal schedule should have higher NPV than no conversion."""
        scenario = _simple_scenario()
        result = dp_optimize(scenario)
        npv_zero = calculate_npv(scenario, [0.0] * 3)
        assert result.npv >= npv_zero - 1  # small tolerance for rounding

    def test_npv_matches_calculate_npv(self):
        """DP's reported NPV should match calculate_npv on the same schedule."""
        scenario = _simple_scenario()
        result = dp_optimize(scenario)
        actual_npv = calculate_npv(scenario, result.yearly_conversions)
        assert abs(result.npv - actual_npv) < 1.0

    def test_respects_balance_constraint(self):
        """Total conversion should never exceed the traditional balance."""
        scenario = _simple_scenario(balance=50_000, incomes=[20_000, 25_000])
        result = dp_optimize(scenario)
        assert result.total_conversion <= 50_000 + 100  # $100 rounding tolerance

    def test_single_year(self):
        """Single year trajectory should work."""
        scenario = _simple_scenario(balance=100_000, incomes=[40_000])
        result = dp_optimize(scenario)
        assert len(result.yearly_conversions) == 1
        assert result.total_conversion >= 0

    def test_large_balance_small_income(self):
        """Large balance with low income should convert aggressively."""
        scenario = _simple_scenario(balance=500_000, incomes=[20_000, 20_000])
        result = dp_optimize(scenario)
        assert result.total_conversion > 0


class TestDPBeatsScipyOrMatches:
    """Cross-validation: DP should find NPV >= scipy for unconstrained cases."""

    def test_simple_3year(self):
        """DP NPV >= scipy NPV on a simple 3-year scenario."""
        from app.engine.optimizer import _run_scipy, _finalize_conversions

        scenario = _simple_scenario()
        n = len(scenario.income_trajectory)
        bal = scenario.traditional_ira_balance

        # Scipy result
        bounds = [(0, bal)] * n
        constraints = [{"type": "ineq", "fun": lambda x: bal - np.sum(x)}]
        raw = _run_scipy(scenario, bounds, constraints)
        scipy_conv = _finalize_conversions(raw, bal)
        scipy_npv = calculate_npv(scenario, scipy_conv)

        # DP result
        dp_result = dp_optimize(scenario)

        assert dp_result.npv >= scipy_npv - 10, (
            f"DP NPV ({dp_result.npv:.2f}) should be >= scipy ({scipy_npv:.2f})"
        )

    def test_demo_scenario(self):
        """DP NPV >= scipy NPV on the 27-year demo scenario."""
        from app.engine.demo import DEMO_SCENARIO
        from app.engine.optimizer import _run_scipy, _finalize_conversions

        n = len(DEMO_SCENARIO.income_trajectory)
        bal = DEMO_SCENARIO.traditional_ira_balance
        bounds = [(0, bal)] * n
        constraints = [{"type": "ineq", "fun": lambda x: bal - np.sum(x)}]
        raw = _run_scipy(DEMO_SCENARIO, bounds, constraints)
        scipy_conv = _finalize_conversions(raw, bal)
        scipy_npv = calculate_npv(DEMO_SCENARIO, scipy_conv)

        dp_result = dp_optimize(DEMO_SCENARIO)

        assert dp_result.npv >= scipy_npv - 10, (
            f"DP NPV ({dp_result.npv:.2f}) should be >= scipy ({scipy_npv:.2f})"
        )


class TestConversionCurve:
    def test_curve_peak_at_optimal(self):
        """No curve point should have higher NPV than the optimal."""
        scenario = _simple_scenario()
        dp_result = dp_optimize(scenario)
        curve = extract_conversion_curve(dp_result, scenario, n_points=20)

        for point in curve:
            assert point.npv <= dp_result.npv + 1, (
                f"Curve point at ${point.total_cap:,.0f} has NPV={point.npv:,.0f} "
                f"> optimal NPV={dp_result.npv:,.0f}"
            )

    def test_curve_has_expected_points(self):
        """Curve should have the requested number of points."""
        scenario = _simple_scenario()
        dp_result = dp_optimize(scenario)
        curve = extract_conversion_curve(dp_result, scenario, n_points=25)
        assert len(curve) == 25

    def test_curve_endpoints(self):
        """First point should be ~0 conversion, last ~full balance."""
        scenario = _simple_scenario(balance=100_000)
        dp_result = dp_optimize(scenario)
        curve = extract_conversion_curve(dp_result, scenario, n_points=20)
        assert curve[0].total_cap == 0
        assert curve[-1].total_cap == 100_000


class TestRetirementValues:
    def test_more_roth_is_better(self):
        """All-Roth should have higher NPV than all-Traditional."""
        scenario = _simple_scenario()
        total_at_ret = 500_000

        trad = np.array([total_at_ret, 0.0])
        roth = np.array([0.0, total_at_ret])

        vals = _compute_retirement_values(trad, roth, scenario)
        assert vals[1] > vals[0], "All-Roth should beat all-Traditional"
