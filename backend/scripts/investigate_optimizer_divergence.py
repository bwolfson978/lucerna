"""Investigate divergence between DP-optimal and scaled-greedy bracket-fill allocations.

For each test scenario, compares NPV at various slider positions (total conversion
amounts) between:
  1. DP-optimal allocation at that budget cap (current 3D DP curve approach)
  2. Proportionally-scaled greedy bracket-fill heuristic (proposed simpler approach)

Generates charts and a text report to help decide if the greedy heuristic is an
acceptable compromise for smoother UX.

Usage:
    cd backend && python -m scripts.investigate_optimizer_divergence
"""

import os
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np

# Ensure backend is on the path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.engine.types import ScenarioInput, YearlyIncome, FilingStatus
from app.engine.heuristic import greedy_bracket_fill
from app.engine.optimizer import calculate_npv
from app.engine.dp import extract_conversion_curve_3d, dp_optimize
from app.engine.demo import DEMO_SCENARIO

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Test scenarios
# ---------------------------------------------------------------------------

SCENARIOS: dict[str, ScenarioInput] = {}

# 1. Demo scenario (Alex)
SCENARIOS["Demo (Alex, 27yr)"] = DEMO_SCENARIO

# 2. 3-year income cliff
SCENARIOS["3yr Income Cliff"] = ScenarioInput(
    age=40,
    filing_status=FilingStatus.SINGLE,
    income_timeline=[
        YearlyIncome(year=2026, gross_income=35000),
        YearlyIncome(year=2027, gross_income=30000),
        YearlyIncome(year=2028, gross_income=150000),
    ],
    traditional_ira_balance=210000,
    roth_ira_balance=5000,
    retirement_age=65,
    years_in_retirement=25,
    annual_retirement_spending=70000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

# 3. Flat income
SCENARIOS["Flat Income (5yr)"] = ScenarioInput(
    age=45,
    filing_status=FilingStatus.SINGLE,
    income_timeline=[
        YearlyIncome(year=2026, gross_income=80000),
        YearlyIncome(year=2027, gross_income=80000),
        YearlyIncome(year=2028, gross_income=80000),
        YearlyIncome(year=2029, gross_income=80000),
        YearlyIncome(year=2030, gross_income=80000),
    ],
    traditional_ira_balance=100000,
    roth_ira_balance=10000,
    retirement_age=65,
    years_in_retirement=25,
    annual_retirement_spending=60000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

# 4. Early retiree — large balance, low income
SCENARIOS["Early Retiree"] = ScenarioInput(
    age=55,
    filing_status=FilingStatus.SINGLE,
    income_timeline=[
        YearlyIncome(year=2026, gross_income=20000),
        YearlyIncome(year=2027, gross_income=20000),
        YearlyIncome(year=2028, gross_income=20000),
    ],
    traditional_ira_balance=500000,
    roth_ira_balance=50000,
    retirement_age=58,
    years_in_retirement=30,
    annual_retirement_spending=60000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

# 5. High earner, short window
SCENARIOS["High Earner (2yr)"] = ScenarioInput(
    age=50,
    filing_status=FilingStatus.SINGLE,
    income_timeline=[
        YearlyIncome(year=2026, gross_income=200000),
        YearlyIncome(year=2027, gross_income=200000),
    ],
    traditional_ira_balance=50000,
    roth_ira_balance=20000,
    retirement_age=65,
    years_in_retirement=25,
    annual_retirement_spending=80000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)

# 6. Mixed income with valley
SCENARIOS["Valley Year"] = ScenarioInput(
    age=42,
    filing_status=FilingStatus.SINGLE,
    income_timeline=[
        YearlyIncome(year=2026, gross_income=120000),
        YearlyIncome(year=2027, gross_income=15000),  # sabbatical
        YearlyIncome(year=2028, gross_income=120000),
        YearlyIncome(year=2029, gross_income=130000),
    ],
    traditional_ira_balance=300000,
    roth_ira_balance=20000,
    retirement_age=65,
    years_in_retirement=25,
    annual_retirement_spending=70000,
    annual_growth_rate=0.07,
    discount_rate=0.05,
)


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def scale_greedy(
    greedy: list[float],
    target_total: float,
    ira_balance: float,
    growth_rate: float,
) -> list[float]:
    """Scale greedy allocation proportionally to hit target_total."""
    greedy_total = sum(greedy)
    if greedy_total == 0 or target_total == 0:
        return [0.0] * len(greedy)
    scale = target_total / greedy_total
    scaled = [g * scale for g in greedy]
    # Enforce sequential balance constraint (with growth)
    remaining = ira_balance
    for i in range(len(scaled)):
        scaled[i] = min(scaled[i], remaining)
        scaled[i] = max(0.0, scaled[i])
        remaining = (remaining - scaled[i]) * (1 + growth_rate)
    return scaled


def find_nearest_curve_point(curve, target_total):
    """Find curve point with closest total_cap."""
    best = None
    best_dist = float("inf")
    for pt in curve:
        dist = abs(pt.total_cap - target_total)
        if dist < best_dist:
            best_dist = dist
            best = pt
    return best


# ---------------------------------------------------------------------------
# Main analysis
# ---------------------------------------------------------------------------

def analyze_scenario(name: str, scenario: ScenarioInput, n_points: int = 50):
    """Run comparison for a single scenario. Returns analysis dict."""
    print(f"\n{'='*70}")
    print(f"  Scenario: {name}")
    print(f"{'='*70}")

    # Get greedy allocation
    greedy = greedy_bracket_fill(scenario)
    greedy_total = sum(greedy)
    print(f"  Greedy total: ${greedy_total:,.0f}")
    print(f"  Greedy per-year: {['${:,.0f}'.format(c) for c in greedy]}")

    # Get DP optimal
    dp_result = dp_optimize(scenario)
    dp_optimal_total = dp_result.total_conversion
    print(f"  DP optimal total: ${dp_optimal_total:,.0f}")

    # NPV at zero conversion
    npv_zero = calculate_npv(scenario, [0.0] * len(scenario.income_timeline))

    # Get DP conversion curve
    curve_max = max(greedy_total, dp_optimal_total) * 1.25
    curve = extract_conversion_curve_3d(scenario, n_curve_points=200, curve_max=curve_max)

    # Test points: evenly spaced from 0 to 125% of greedy total
    max_test = max(greedy_total, dp_optimal_total, scenario.traditional_ira_balance * 0.5) * 1.25
    if max_test == 0:
        max_test = scenario.traditional_ira_balance * 0.5
    test_totals = np.linspace(0, max_test, n_points)

    results = []
    for target in test_totals:
        target = float(target)
        if target < 1:
            target = 0.0

        # Scaled greedy
        scaled = scale_greedy(greedy, target, scenario.traditional_ira_balance, scenario.annual_growth_rate)
        npv_greedy = calculate_npv(scenario, scaled)

        # DP-optimal at this cap
        nearest = find_nearest_curve_point(curve, target)
        dp_alloc = nearest.yearly_conversions if nearest else [0.0] * len(scenario.income_timeline)
        npv_dp = calculate_npv(scenario, dp_alloc)

        results.append({
            "target_total": target,
            "npv_greedy": npv_greedy,
            "npv_dp": npv_dp,
            "npv_diff": npv_dp - npv_greedy,
            "greedy_alloc": scaled,
            "dp_alloc": dp_alloc,
        })

    # Print summary table
    max_savings = max(r["npv_dp"] for r in results) - npv_zero
    print(f"\n  NPV at zero: ${npv_zero:,.0f}")
    print(f"  Max savings (DP): ${max_savings:,.0f}")
    print()
    print(f"  {'Target':>12} {'NPV(Greedy)':>14} {'NPV(DP)':>14} {'Diff($)':>10} {'Diff(%)':>10}")
    print(f"  {'-'*12} {'-'*14} {'-'*14} {'-'*10} {'-'*10}")

    # Print at key percentages of greedy total
    key_pcts = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25]
    for pct in key_pcts:
        target = greedy_total * pct
        # Find closest result
        closest = min(results, key=lambda r: abs(r["target_total"] - target))
        diff_pct = (closest["npv_diff"] / max_savings * 100) if max_savings > 0 else 0
        print(
            f"  ${closest['target_total']:>10,.0f} "
            f"${closest['npv_greedy']:>12,.0f} "
            f"${closest['npv_dp']:>12,.0f} "
            f"${closest['npv_diff']:>8,.0f} "
            f"{diff_pct:>8.2f}%"
        )

    # Find worst divergence
    worst = max(results, key=lambda r: abs(r["npv_diff"]))
    worst_pct = (worst["npv_diff"] / max_savings * 100) if max_savings > 0 else 0
    print(f"\n  Worst divergence: ${worst['npv_diff']:,.0f} ({worst_pct:.2f}% of max savings) at ${worst['target_total']:,.0f}")

    if abs(worst["npv_diff"]) > 1:
        print(f"    Greedy alloc: {['${:,.0f}'.format(c) for c in worst['greedy_alloc']]}")
        print(f"    DP alloc:     {['${:,.0f}'.format(c) for c in worst['dp_alloc']]}")

    return {
        "name": name,
        "results": results,
        "greedy_total": greedy_total,
        "dp_optimal_total": dp_optimal_total,
        "npv_zero": npv_zero,
        "max_savings": max_savings,
        "greedy_alloc": greedy,
    }


def plot_scenario(analysis: dict, idx: int):
    """Generate Chart A (NPV curves) and Chart B (NPV gap) for a scenario."""
    results = analysis["results"]
    name = analysis["name"]

    totals = [r["target_total"] for r in results]
    npv_greedy = [r["npv_greedy"] for r in results]
    npv_dp = [r["npv_dp"] for r in results]
    npv_diff = [r["npv_diff"] for r in results]

    # Chart A: NPV Curves
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(totals, [v / 1000 for v in npv_dp], "b-", linewidth=2, label="DP-Optimal")
    ax.plot(totals, [v / 1000 for v in npv_greedy], color="orange", linewidth=2, linestyle="--", label="Scaled Greedy")
    ax.axvline(analysis["greedy_total"], color="orange", alpha=0.4, linestyle=":", label=f"Greedy total (${analysis['greedy_total']:,.0f})")
    ax.axvline(analysis["dp_optimal_total"], color="blue", alpha=0.4, linestyle=":", label=f"DP optimal (${analysis['dp_optimal_total']:,.0f})")
    ax.set_xlabel("Total Conversion Amount ($)")
    ax.set_ylabel("NPV ($K)")
    ax.set_title(f"{name}: NPV by Strategy")
    ax.legend(loc="best", fontsize=9)
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / f"{idx:02d}_npv_curves_{_safe_name(name)}.png", dpi=150)
    plt.close(fig)

    # Chart B: NPV Gap
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(totals, npv_diff, "r-", linewidth=2)
    ax.fill_between(totals, 0, npv_diff, alpha=0.2, color="red")
    ax.axhline(0, color="gray", linewidth=0.5)
    ax.axvline(analysis["greedy_total"], color="orange", alpha=0.4, linestyle=":", label=f"Greedy total")
    ax.axvline(analysis["dp_optimal_total"], color="blue", alpha=0.4, linestyle=":", label=f"DP optimal")
    ax.set_xlabel("Total Conversion Amount ($)")
    ax.set_ylabel("NPV Gap: DP minus Greedy ($)")
    ax.set_title(f"{name}: NPV Advantage of DP over Scaled Greedy")
    ax.legend(loc="best", fontsize=9)
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / f"{idx:02d}_npv_gap_{_safe_name(name)}.png", dpi=150)
    plt.close(fig)


def plot_combined_pct(all_analyses: list[dict]):
    """Chart C: Combined % gap across all scenarios (only those with meaningful savings)."""
    # Only include scenarios where greedy_total > 0 and max_savings > $500
    meaningful = [a for a in all_analyses if a["greedy_total"] > 0 and a["max_savings"] > 500]

    if not meaningful:
        return

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
    colors = plt.cm.tab10(range(len(meaningful)))

    # Chart C1: Absolute $ gap
    for i, analysis in enumerate(meaningful):
        results = analysis["results"]
        totals = [r["target_total"] for r in results]
        gaps = [r["npv_diff"] for r in results]
        ax1.plot(totals, gaps, linewidth=2, label=analysis["name"], color=colors[i])

    ax1.axhline(0, color="gray", linewidth=0.5)
    ax1.set_xlabel("Total Conversion Amount ($)")
    ax1.set_ylabel("NPV Gap: DP minus Greedy ($)")
    ax1.set_title("DP Advantage Over Scaled Greedy — Absolute $ Gap (All Scenarios)")
    ax1.legend(loc="best", fontsize=9)
    ax1.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
    ax1.grid(True, alpha=0.3)

    # Chart C2: % of max savings
    for i, analysis in enumerate(meaningful):
        results = analysis["results"]
        max_savings = analysis["max_savings"]
        greedy_total = analysis["greedy_total"]

        pcts = [r["target_total"] / greedy_total * 100 for r in results]
        gaps = [r["npv_diff"] / max_savings * 100 for r in results]
        ax2.plot(pcts, gaps, linewidth=2, label=analysis["name"], color=colors[i])

    ax2.axhline(0, color="gray", linewidth=0.5)
    ax2.axvline(100, color="gray", linewidth=0.5, linestyle=":")
    ax2.set_xlabel("Slider Position (% of Greedy Total)")
    ax2.set_ylabel("NPV Gap as % of Max Savings")
    ax2.set_title("DP Advantage Over Scaled Greedy — % of Max Savings")
    ax2.legend(loc="best", fontsize=9)
    ax2.grid(True, alpha=0.3)
    ax2.set_xlim(0, 150)

    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "combined_gap.png", dpi=150)
    plt.close(fig)


def plot_allocation_comparison(all_analyses: list[dict]):
    """Chart D: Side-by-side allocation comparison at the most divergent slider position."""
    # Pick scenarios with meaningful divergence
    meaningful = [a for a in all_analyses if a["greedy_total"] > 0 and a["max_savings"] > 500]
    if not meaningful:
        return

    n = len(meaningful)
    fig, axes = plt.subplots(n, 1, figsize=(12, 4 * n), squeeze=False)

    for i, analysis in enumerate(meaningful):
        ax = axes[i, 0]
        results = analysis["results"]
        # Find the point of max divergence
        worst = max(results, key=lambda r: abs(r["npv_diff"]))
        greedy_alloc = worst["greedy_alloc"]
        dp_alloc = worst["dp_alloc"]
        n_years = len(greedy_alloc)

        # Only show first N years that have any allocation (trim trailing zeros)
        max_show = n_years
        for j in range(n_years - 1, -1, -1):
            if greedy_alloc[j] > 0 or dp_alloc[j] > 0:
                max_show = j + 1
                break
        max_show = min(max_show + 1, n_years)  # one extra for context
        if max_show > 15:
            max_show = 15  # cap display for long timelines

        x = np.arange(max_show)
        width = 0.35
        ax.bar(x - width/2, [g/1000 for g in greedy_alloc[:max_show]], width, label="Scaled Greedy", color="orange", alpha=0.8)
        ax.bar(x + width/2, [d/1000 for d in dp_alloc[:max_show]], width, label="DP-Optimal", color="blue", alpha=0.8)
        ax.set_ylabel("Conversion ($K)")
        ax.set_title(f"{analysis['name']}: Year-by-Year Allocation at ${worst['target_total']:,.0f} total (max divergence point)")
        ax.set_xticks(x)
        ax.set_xticklabels([f"Yr {j+1}" for j in range(max_show)], fontsize=8)
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3, axis="y")

    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "allocation_comparison.png", dpi=150)
    plt.close(fig)


def _safe_name(name: str) -> str:
    return name.lower().replace(" ", "_").replace("(", "").replace(")", "").replace(",", "")


def main():
    print("=" * 70)
    print("  OPTIMIZER DIVERGENCE INVESTIGATION")
    print("  Comparing DP-Optimal vs Scaled Greedy Bracket-Fill")
    print("=" * 70)

    all_analyses = []

    for idx, (name, scenario) in enumerate(SCENARIOS.items()):
        analysis = analyze_scenario(name, scenario)
        all_analyses.append(analysis)
        plot_scenario(analysis, idx)

    # Combined charts
    plot_combined_pct(all_analyses)
    plot_allocation_comparison(all_analyses)

    # Overall summary
    print("\n" + "=" * 70)
    print("  OVERALL SUMMARY")
    print("=" * 70)
    print(f"\n  {'Scenario':<25} {'Max Gap ($)':>12} {'Max Gap (%)':>12} {'Avg |Gap| ($)':>14}")
    print(f"  {'-'*25} {'-'*12} {'-'*12} {'-'*14}")

    for analysis in all_analyses:
        results = analysis["results"]
        max_savings = analysis["max_savings"]
        diffs = [r["npv_diff"] for r in results]
        max_gap = max(diffs, key=abs)
        max_gap_pct = (max_gap / max_savings * 100) if max_savings > 0 else 0
        avg_abs_gap = sum(abs(d) for d in diffs) / len(diffs)
        print(
            f"  {analysis['name']:<25} "
            f"${max_gap:>10,.0f} "
            f"{max_gap_pct:>10.2f}% "
            f"${avg_abs_gap:>12,.0f}"
        )

    print(f"\n  Charts saved to: {OUTPUT_DIR}/")
    print()


if __name__ == "__main__":
    main()
