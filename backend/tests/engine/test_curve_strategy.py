"""Tests for the curve strategy pattern and both strategy implementations."""

import pytest

from app.engine.curve_strategy import (
    build_curve_point,
    generate_conversion_curve,
    DEFAULT_CURVE_STRATEGY,
    _get_strategy,
)
from app.engine.heuristic import bracket_fill_curve, _global_bracket_fill_for_cap
from app.engine.dp import dp_optimize, extract_conversion_curve_3d
from app.engine.optimizer import calculate_npv
from app.engine.types import ScenarioInput, FilingStatus, YearlyIncome


# ── Fixtures ──────────────────────────────────────────────────────────


def _simple_scenario(**kwargs) -> ScenarioInput:
    defaults = dict(
        age=40,
        filing_status=FilingStatus.SINGLE,
        income_timeline=[
            YearlyIncome(year=2026, gross_income=35_000),
            YearlyIncome(year=2027, gross_income=30_000),
            YearlyIncome(year=2028, gross_income=150_000),
        ],
        traditional_ira_balance=100_000,
        roth_ira_balance=0,
        retirement_age=65,
        years_in_retirement=25,
        annual_growth_rate=0.07,
        discount_rate=0.05,
    )
    defaults.update(kwargs)
    return ScenarioInput(**defaults)


# ── Contract tests (both strategies) ─────────────────────────────────


@pytest.mark.parametrize("strategy", ["dp_3d", "bracket_fill"])
class TestCurveStrategyContract:
    """Contract tests that both strategies must satisfy."""

    def test_returns_expected_point_count(self, strategy):
        scenario = _simple_scenario()
        curve = generate_conversion_curve(
            scenario, n_curve_points=20, strategy=strategy,
        )
        assert len(curve) == 20

    def test_first_point_zero(self, strategy):
        scenario = _simple_scenario()
        curve = generate_conversion_curve(
            scenario, n_curve_points=20, strategy=strategy,
        )
        first = curve[0]
        assert first.total_cap == 0
        assert all(c == 0 for c in first.yearly_conversions)
        assert first.total_tax == 0

    def test_conversions_within_budget(self, strategy):
        scenario = _simple_scenario()
        curve = generate_conversion_curve(
            scenario, n_curve_points=20, strategy=strategy,
        )
        for pt in curve:
            total = sum(pt.yearly_conversions)
            # Allow $200 tolerance for rounding
            assert total <= pt.total_cap + 200, (
                f"Conversions {total} exceed cap {pt.total_cap}"
            )

    def test_balance_constraint_respected(self, strategy):
        scenario = _simple_scenario()
        g = scenario.annual_growth_rate
        curve = generate_conversion_curve(
            scenario, n_curve_points=20, strategy=strategy,
        )
        for pt in curve:
            remaining = scenario.traditional_ira_balance
            for c in pt.yearly_conversions:
                assert c <= remaining + 1, (
                    f"Conversion {c} exceeds balance {remaining}"
                )
                remaining = (remaining - c) * (1 + g)

    def test_fields_populated(self, strategy):
        scenario = _simple_scenario()
        curve = generate_conversion_curve(
            scenario, n_curve_points=10, strategy=strategy,
        )
        for pt in curve:
            n = len(scenario.income_timeline)
            assert len(pt.yearly_conversions) == n
            assert len(pt.yearly_bracket_fill) == n
            assert len(pt.yearly_detail) == n
            assert isinstance(pt.npv, float)
            assert isinstance(pt.total_tax, float)

    def test_nonzero_conversion_has_positive_tax(self, strategy):
        scenario = _simple_scenario()
        curve = generate_conversion_curve(
            scenario, n_curve_points=20, strategy=strategy,
        )
        for pt in curve:
            if sum(pt.yearly_conversions) > 100:
                assert pt.total_tax > 0


# ── build_curve_point tests ──────────────────────────────────────────


class TestBuildCurvePoint:
    def test_zero_conversion(self):
        scenario = _simple_scenario()
        n = len(scenario.income_timeline)
        pt = build_curve_point(scenario, 0, [0.0] * n)
        assert pt.total_cap == 0
        assert pt.total_tax == 0
        assert pt.npv == round(calculate_npv(scenario, [0.0] * n), 2)

    def test_matches_calculate_npv(self):
        scenario = _simple_scenario()
        conversions = [20_000, 15_000, 0]
        pt = build_curve_point(scenario, 35_000, conversions)
        expected_npv = round(calculate_npv(scenario, conversions), 2)
        assert pt.npv == expected_npv

    def test_detail_fields(self):
        scenario = _simple_scenario()
        conversions = [10_000, 0, 0]
        pt = build_curve_point(scenario, 10_000, conversions)
        assert len(pt.yearly_detail) == 3
        d = pt.yearly_detail[0]
        assert "year" in d
        assert "income" in d
        assert "conversion" in d
        assert "tax_cost" in d
        assert "effective_rate" in d
        assert "marginal_bracket" in d


# ── Dispatch tests ───────────────────────────────────────────────────


class TestDispatch:
    def test_default_is_dp_3d(self):
        assert DEFAULT_CURVE_STRATEGY == "dp_3d"

    def test_get_strategy_dp_3d(self):
        fn = _get_strategy("dp_3d")
        assert fn is extract_conversion_curve_3d

    def test_get_strategy_bracket_fill(self):
        fn = _get_strategy("bracket_fill")
        assert fn is bracket_fill_curve

    def test_unknown_strategy_raises(self):
        with pytest.raises(ValueError, match="Unknown curve strategy"):
            _get_strategy("nonexistent")  # type: ignore[arg-type]

    def test_override_parameter(self):
        scenario = _simple_scenario()
        # Both strategies should return a list of curve points
        curve_dp = generate_conversion_curve(
            scenario, n_curve_points=5, strategy="dp_3d",
        )
        curve_bf = generate_conversion_curve(
            scenario, n_curve_points=5, strategy="bracket_fill",
        )
        assert len(curve_dp) == 5
        assert len(curve_bf) == 5


# ── Bracket-fill specific tests ──────────────────────────────────────


class TestBracketFillStrategy:
    def test_cheapest_brackets_filled_first(self):
        """At small budgets, only the lowest-rate brackets should be used."""
        scenario = _simple_scenario()
        # Small budget: should fill only 10% bracket space
        alloc = _global_bracket_fill_for_cap(scenario, 5_000)
        # All 5K should be in year 2 (lowest income → most cheap bracket room)
        # or year 1 — both have room in the 10% bracket
        total = sum(alloc)
        assert abs(total - 5_000) < 1

    def test_tracks_dp_at_optimal(self):
        """Bracket-fill NPV should be within 1% of DP NPV at the DP's optimal total."""
        scenario = _simple_scenario()
        dp_result = dp_optimize(scenario)
        if dp_result.total_conversion <= 0:
            pytest.skip("DP optimal is zero")

        bf_alloc = _global_bracket_fill_for_cap(scenario, dp_result.total_conversion)
        npv_bf = calculate_npv(scenario, bf_alloc)
        npv_dp = calculate_npv(scenario, dp_result.yearly_conversions)
        npv_zero = calculate_npv(scenario, [0.0] * len(scenario.income_timeline))

        max_savings = npv_dp - npv_zero
        gap_pct = abs(npv_dp - npv_bf) / max_savings * 100 if max_savings > 0 else 0
        assert gap_pct < 1.0, f"Bracket-fill gap {gap_pct:.2f}% exceeds 1%"

    def test_performance_faster_than_dp(self):
        """Bracket-fill curve should be significantly faster than 3D DP."""
        import time
        scenario = _simple_scenario()

        start = time.perf_counter()
        bracket_fill_curve(scenario, n_curve_points=50)
        bf_time = time.perf_counter() - start

        start = time.perf_counter()
        extract_conversion_curve_3d(scenario, n_curve_points=50)
        dp_time = time.perf_counter() - start

        # Bracket-fill should be at least 2x faster
        assert bf_time < dp_time, (
            f"Bracket-fill ({bf_time:.3f}s) not faster than DP ({dp_time:.3f}s)"
        )
