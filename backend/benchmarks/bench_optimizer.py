"""Benchmark the optimizer to identify latency bottlenecks.

Usage:
    cd backend && python -m benchmarks.bench_optimizer
"""

import time
from contextlib import contextmanager

from app.engine.demo import DEMO_SCENARIO
from app.engine.optimizer import (
    optimize,
    calculate_npv,
    _run_scipy,
    compute_conversion_curve,
    _finalize_conversions,
)
from app.engine.heuristic import greedy_bracket_fill
from app.engine.trace import generate_reasoning_trace
from app.engine.types import ScenarioInput, FilingStatus, YearlyIncome

import numpy as np
from scipy.optimize import minimize


# --- Helpers ---

@contextmanager
def timer(label: str):
    start = time.perf_counter()
    yield
    elapsed = time.perf_counter() - start
    print(f"  {label}: {elapsed:.3f}s")


def short_scenario() -> ScenarioInput:
    """3-year Alex scenario (like the test fixtures)."""
    return ScenarioInput(
        age=38,
        filing_status=FilingStatus.SINGLE,
        income_timeline=[
            YearlyIncome(year=2026, gross_income=35000),
            YearlyIncome(year=2027, gross_income=30000),
            YearlyIncome(year=2028, gross_income=150000),
        ],
        traditional_ira_balance=210000,
        retirement_age=65,
        years_in_retirement=25,
        annual_growth_rate=0.07,
        discount_rate=0.05,
    )


# --- Which starting points win? ---

def profile_starting_points(scenario: ScenarioInput):
    """Run each starting point individually and report which wins."""
    n_years = len(scenario.income_timeline)
    max_balance = scenario.traditional_ira_balance

    greedy = greedy_bracket_fill(scenario)
    uniform = [max_balance / n_years] * n_years
    front_loaded = [max_balance * 0.6 / max(1, n_years - 1)] * n_years
    if n_years > 1:
        front_loaded[0] = max_balance * 0.4
    back_loaded = list(reversed(front_loaded))
    zero = [0.0] * n_years

    names = ["greedy", "uniform", "front_loaded", "back_loaded", "zero"]
    starting_points = [greedy, uniform, front_loaded, back_loaded, zero]

    bounds = [(0, max_balance) for _ in range(n_years)]
    constraints = [
        {"type": "ineq", "fun": lambda x: max_balance - np.sum(x)},
    ]

    results = []
    for name, x0 in zip(names, starting_points):
        x0_arr = np.array(x0, dtype=float)
        for i, (lo, hi) in enumerate(bounds):
            x0_arr[i] = np.clip(x0_arr[i], lo, hi)
        if np.sum(x0_arr) > max_balance:
            x0_arr = x0_arr * (max_balance / np.sum(x0_arr))

        start = time.perf_counter()
        try:
            result = minimize(
                lambda x, s=scenario: -calculate_npv(s, x.tolist()),
                x0_arr,
                args=(),
                method="SLSQP",
                bounds=bounds,
                constraints=constraints,
                options={"maxiter": 200, "ftol": 1e-8},
            )
            elapsed = time.perf_counter() - start
            npv = -result.fun if result.success else float("-inf")
            results.append((name, npv, elapsed, result.nit, result.success))
        except Exception as e:
            elapsed = time.perf_counter() - start
            results.append((name, float("-inf"), elapsed, 0, False))

    # Sort by NPV descending
    results.sort(key=lambda r: r[1], reverse=True)

    print(f"\n  Starting point analysis ({n_years}-year scenario):")
    print(f"  {'Name':<14} {'NPV':>14} {'Time':>8} {'Iters':>6} {'Success':>8}")
    print(f"  {'-'*54}")
    for name, npv, elapsed, nit, success in results:
        print(f"  {name:<14} {npv:>14,.2f} {elapsed:>7.3f}s {nit:>6} {'OK' if success else 'FAIL':>8}")

    winner = results[0][0]
    print(f"\n  Winner: {winner} (NPV={results[0][1]:,.2f})")
    return results


# --- Main benchmark ---

def run_benchmarks():
    print("=" * 60)
    print("Optimizer Latency Benchmark")
    print("=" * 60)

    # --- Demo scenario (27 years) ---
    print(f"\n--- Demo scenario: {len(DEMO_SCENARIO.income_timeline)} years ---")

    with timer("Full optimize(DEMO_SCENARIO)"):
        result = optimize(DEMO_SCENARIO)

    print(f"  Result: total_conversion=${result.total_conversion:,.0f}, "
          f"savings=${result.estimated_lifetime_tax_savings:,.2f}")
    print(f"  Conversion curve points: {len(result.conversion_curve)}")

    # Phase-by-phase timing
    print("\n  Phase breakdown:")
    n_years = len(DEMO_SCENARIO.income_timeline)
    max_balance = DEMO_SCENARIO.traditional_ira_balance

    bounds = [(0, max_balance) for _ in range(n_years)]
    constraints = [{"type": "ineq", "fun": lambda x: max_balance - np.sum(x)}]

    with timer("_run_scipy (main, 5 restarts)"):
        raw = _run_scipy(DEMO_SCENARIO, bounds, constraints)
    conversions = _finalize_conversions(raw, max_balance)

    with timer("compute_conversion_curve (8 points)"):
        curve = compute_conversion_curve(DEMO_SCENARIO)

    with timer("calculate_npv (single call)"):
        for _ in range(100):
            calculate_npv(DEMO_SCENARIO, conversions)
    print(f"    ^ 100 calls averaged")

    with timer("greedy_bracket_fill"):
        for _ in range(100):
            greedy_bracket_fill(DEMO_SCENARIO)
    print(f"    ^ 100 calls averaged")

    # Starting point analysis
    profile_starting_points(DEMO_SCENARIO)

    # --- Short scenario (3 years) ---
    scenario_3yr = short_scenario()
    print(f"\n--- Short scenario: {len(scenario_3yr.income_timeline)} years ---")

    with timer("Full optimize(3-year)"):
        result_3yr = optimize(scenario_3yr)

    print(f"  Result: total_conversion=${result_3yr.total_conversion:,.0f}, "
          f"savings=${result_3yr.estimated_lifetime_tax_savings:,.2f}")
    print(f"  Conversion curve points: {len(result_3yr.conversion_curve)}")

    # Starting point analysis for short scenario
    profile_starting_points(scenario_3yr)

    print("\n" + "=" * 60)
    print("Benchmark complete")
    print("=" * 60)


if __name__ == "__main__":
    run_benchmarks()
