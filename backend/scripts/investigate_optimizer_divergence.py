"""Investigate divergence between DP-optimal and global bracket-fill allocations.

For each test scenario, compares NPV at various slider positions (total conversion
amounts) between:
  1. DP-optimal allocation at that budget cap (current 3D DP curve approach)
  2. Global bracket-fill heuristic: fills the cheapest available bracket slots
     across all years, sorted by effective PV cost (rate * discount_factor).
     This is the proposed simpler approach for a smoother slider UX.

Generates charts and a text report to help decide if the bracket-fill heuristic
is an acceptable compromise.

Usage:
    cd backend && python -m scripts.investigate_optimizer_divergence
"""

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
from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
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
# Global bracket-fill algorithm (the proposed slider alternative)
# ---------------------------------------------------------------------------

def global_bracket_fill(scenario: ScenarioInput, target_total: float) -> list[float]:
    """Fill the cheapest available bracket slots globally across all years.

    For a given slider total, progressively fills bracket space sorted by
    bracket rate (cheapest first).  Within the same rate, earlier years are
    filled first — converting earlier gives more years of tax-free Roth
    growth, which slightly favors earlier years at the same marginal rate.

    The visual effect: as the slider increases, the lowest-rate bracket
    tiers fill up across all years first, then the next tier starts
    filling.  Brackets visually "flow" and fill from cheapest to most
    expensive.

    The balance constraint (can't convert more than remaining IRA balance
    at each year, accounting for growth) is enforced via a post-processing
    pass that redistributes any excess.
    """
    if target_total <= 0:
        return [0.0] * len(scenario.income_timeline)

    n_years = len(scenario.income_timeline)
    deduction = STANDARD_DEDUCTION[scenario.filing_status]
    brackets = BRACKETS[scenario.filing_status]

    # Enumerate all bracket slots across all years.
    # Each slot is a chunk of bracket space in a specific year.
    slots: list[dict] = []
    for t, year_info in enumerate(scenario.income_timeline):
        taxable = max(0, year_info.gross_income - deduction)

        for bracket in brackets:
            rate = bracket["rate"]
            b_min = bracket["min"]
            b_max = bracket["max"]

            if b_max == float("inf"):
                # Top bracket: cap room at IRA balance (generous upper bound)
                b_max = b_min + scenario.traditional_ira_balance
            if taxable >= b_max:
                continue  # bracket fully filled by base income

            room = b_max - max(taxable, b_min)
            if room <= 0:
                continue

            slots.append({
                "rate": rate,
                "year": t,
                "room": room,
            })

    # Sort by bracket rate (cheapest first), then by year (earlier first)
    slots.sort(key=lambda s: (s["rate"], s["year"]))

    # Fill slots greedily
    conversions = [0.0] * n_years
    remaining_budget = target_total

    for slot in slots:
        if remaining_budget <= 0:
            break
        t = slot["year"]
        fill = min(slot["room"], remaining_budget)
        conversions[t] += fill
        remaining_budget -= fill

    # Enforce sequential balance constraint (with inter-year growth).
    # If a year's allocation exceeds available balance, cap it and
    # try to redistribute excess to the next cheapest available slots.
    excess = _enforce_balance_constraint(conversions, scenario)

    # If there's excess that couldn't be placed, try redistribution
    if excess > 1:
        _redistribute_excess(conversions, excess, slots, scenario)

    return conversions


def _enforce_balance_constraint(
    conversions: list[float],
    scenario: ScenarioInput,
) -> float:
    """Cap each year's conversion to available balance. Returns total excess."""
    g = scenario.annual_growth_rate
    remaining = scenario.traditional_ira_balance
    total_excess = 0.0

    for i in range(len(conversions)):
        if conversions[i] > remaining:
            total_excess += conversions[i] - remaining
            conversions[i] = remaining
        conversions[i] = max(0.0, conversions[i])
        remaining = (remaining - conversions[i]) * (1 + g)

    return total_excess


def _redistribute_excess(
    conversions: list[float],
    excess: float,
    slots: list[dict],
    scenario: ScenarioInput,
) -> None:
    """Try to place excess budget in remaining capacity, cheapest-first."""
    g = scenario.annual_growth_rate
    remaining_budget = excess

    for slot in slots:
        if remaining_budget <= 0:
            break
        t = slot["year"]
        # Recompute available balance at year t
        balance_at_t = scenario.traditional_ira_balance
        for j in range(t):
            balance_at_t = (balance_at_t - conversions[j]) * (1 + g)

        available = max(0, balance_at_t - conversions[t])
        current_in_bracket = conversions[t]
        # How much more room in this bracket slot?
        bracket_room = slot["room"]
        # We already filled some of this year; figure out how much of
        # THIS bracket's room is still unused. This is approximate since
        # we don't track per-bracket fill, but for slots sorted by cost
        # (lower brackets first), it works out.
        additional = min(bracket_room, available, remaining_budget)
        # Only add if this bracket slot hasn't been fully used
        if additional > 0 and current_in_bracket < balance_at_t:
            add = min(additional, balance_at_t - current_in_bracket)
            if add > 0:
                conversions[t] += add
                remaining_budget -= add


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
# Analysis
# ---------------------------------------------------------------------------

def analyze_scenario(name: str, scenario: ScenarioInput, n_points: int = 50):
    """Run comparison for a single scenario. Returns analysis dict."""
    print(f"\n{'='*70}")
    print(f"  Scenario: {name}")
    print(f"{'='*70}")

    n_years = len(scenario.income_timeline)

    # Get greedy allocation (for reference / total range)
    greedy = greedy_bracket_fill(scenario)
    greedy_total = sum(greedy)

    # Get bracket-fill at greedy total (to show the full allocation)
    bf_at_greedy = global_bracket_fill(scenario, greedy_total)
    print(f"  Greedy total: ${greedy_total:,.0f}")
    print(f"  Greedy per-year:       {['${:,.0f}'.format(c) for c in greedy]}")
    print(f"  Bracket-fill per-year: {['${:,.0f}'.format(c) for c in bf_at_greedy]}")

    # Get DP optimal
    dp_result = dp_optimize(scenario)
    dp_optimal_total = dp_result.total_conversion
    print(f"  DP optimal total: ${dp_optimal_total:,.0f}")
    print(f"  DP per-year:           {['${:,.0f}'.format(c) for c in dp_result.yearly_conversions]}")

    # NPV at zero conversion
    npv_zero = calculate_npv(scenario, [0.0] * n_years)

    # Get DP conversion curve
    max_total = max(greedy_total, dp_optimal_total, scenario.traditional_ira_balance * 0.3)
    curve_max = max_total * 1.25
    curve = extract_conversion_curve_3d(scenario, n_curve_points=200, curve_max=curve_max)

    # Test points: evenly spaced from 0 to max
    test_totals = np.linspace(0, curve_max, n_points)

    results = []
    for target in test_totals:
        target = float(target)
        if target < 1:
            target = 0.0

        # Global bracket-fill heuristic
        bf_alloc = global_bracket_fill(scenario, target)
        npv_bf = calculate_npv(scenario, bf_alloc)

        # DP-optimal at this cap
        nearest = find_nearest_curve_point(curve, target)
        dp_alloc = nearest.yearly_conversions if nearest else [0.0] * n_years
        npv_dp = calculate_npv(scenario, dp_alloc)

        results.append({
            "target_total": target,
            "npv_bf": npv_bf,
            "npv_dp": npv_dp,
            "npv_diff": npv_dp - npv_bf,
            "bf_alloc": bf_alloc,
            "dp_alloc": dp_alloc,
        })

    # Print summary table
    max_savings = max(r["npv_dp"] for r in results) - npv_zero
    if max_savings <= 0:
        max_savings_bf = max(r["npv_bf"] for r in results) - npv_zero
        max_savings = max(max_savings, max_savings_bf, 1)

    print(f"\n  NPV at zero: ${npv_zero:,.0f}")
    print(f"  Max savings (DP): ${max_savings:,.0f}")
    print()

    # Print at key absolute totals
    key_targets = [t for t in [10000, 25000, 50000, 75000, 100000, 150000, 200000] if t <= curve_max]
    if dp_optimal_total > 0:
        key_targets.append(dp_optimal_total)
    key_targets = sorted(set(key_targets))

    print(f"  {'Target':>12} {'NPV(BrFill)':>14} {'NPV(DP)':>14} {'Diff($)':>10} {'Diff(%)':>10}")
    print(f"  {'-'*12} {'-'*14} {'-'*14} {'-'*10} {'-'*10}")

    for target in key_targets:
        closest = min(results, key=lambda r: abs(r["target_total"] - target))
        diff_pct = (closest["npv_diff"] / max_savings * 100) if max_savings > 0 else 0
        marker = " <-- DP opt" if abs(target - dp_optimal_total) < 1000 else ""
        print(
            f"  ${closest['target_total']:>10,.0f} "
            f"${closest['npv_bf']:>12,.0f} "
            f"${closest['npv_dp']:>12,.0f} "
            f"${closest['npv_diff']:>8,.0f} "
            f"{diff_pct:>8.2f}%{marker}"
        )

    # Find worst divergence
    worst = max(results, key=lambda r: abs(r["npv_diff"]))
    worst_pct = (worst["npv_diff"] / max_savings * 100) if max_savings > 0 else 0
    print(f"\n  Worst divergence: ${worst['npv_diff']:,.0f} ({worst_pct:.2f}% of max savings) at ${worst['target_total']:,.0f}")

    if abs(worst["npv_diff"]) > 1:
        n_show = min(n_years, 10)
        suffix = f" ... +{n_years - n_show} more" if n_years > n_show else ""
        print(f"    BrFill alloc: {['${:,.0f}'.format(c) for c in worst['bf_alloc'][:n_show]]}{suffix}")
        print(f"    DP alloc:     {['${:,.0f}'.format(c) for c in worst['dp_alloc'][:n_show]]}{suffix}")

    return {
        "name": name,
        "results": results,
        "greedy_total": greedy_total,
        "dp_optimal_total": dp_optimal_total,
        "npv_zero": npv_zero,
        "max_savings": max_savings,
        "greedy_alloc": greedy,
    }


# ---------------------------------------------------------------------------
# Charts
# ---------------------------------------------------------------------------

def plot_scenario(analysis: dict, idx: int):
    """Generate Chart A (NPV curves) and Chart B (NPV gap) for a scenario."""
    results = analysis["results"]
    name = analysis["name"]

    totals = [r["target_total"] for r in results]
    npv_bf = [r["npv_bf"] for r in results]
    npv_dp = [r["npv_dp"] for r in results]
    npv_diff = [r["npv_diff"] for r in results]

    # Chart A: NPV Curves
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(totals, [v / 1000 for v in npv_dp], "b-", linewidth=2, label="DP-Optimal")
    ax.plot(totals, [v / 1000 for v in npv_bf], color="orange", linewidth=2, linestyle="--", label="Global Bracket-Fill")
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
    ax.axvline(analysis["dp_optimal_total"], color="blue", alpha=0.4, linestyle=":", label=f"DP optimal")
    ax.set_xlabel("Total Conversion Amount ($)")
    ax.set_ylabel("NPV Gap: DP minus Bracket-Fill ($)")
    ax.set_title(f"{name}: NPV Advantage of DP over Global Bracket-Fill")
    ax.legend(loc="best", fontsize=9)
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / f"{idx:02d}_npv_gap_{_safe_name(name)}.png", dpi=150)
    plt.close(fig)


def plot_combined(all_analyses: list[dict]):
    """Chart C: Combined gap across all scenarios with meaningful savings."""
    meaningful = [a for a in all_analyses if a["max_savings"] > 500]
    if not meaningful:
        return

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))
    colors = plt.cm.tab10(range(len(meaningful)))

    for i, analysis in enumerate(meaningful):
        results = analysis["results"]
        totals = [r["target_total"] for r in results]
        gaps = [r["npv_diff"] for r in results]
        ax1.plot(totals, gaps, linewidth=2, label=analysis["name"], color=colors[i])

    ax1.axhline(0, color="gray", linewidth=0.5)
    ax1.set_xlabel("Total Conversion Amount ($)")
    ax1.set_ylabel("NPV Gap: DP minus Bracket-Fill ($)")
    ax1.set_title("DP Advantage Over Global Bracket-Fill — Absolute $ Gap")
    ax1.legend(loc="best", fontsize=9)
    ax1.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
    ax1.grid(True, alpha=0.3)

    for i, analysis in enumerate(meaningful):
        results = analysis["results"]
        max_savings = analysis["max_savings"]
        totals = [r["target_total"] for r in results]
        gaps = [r["npv_diff"] / max_savings * 100 for r in results]
        ax2.plot(totals, gaps, linewidth=2, label=analysis["name"], color=colors[i])

    ax2.axhline(0, color="gray", linewidth=0.5)
    ax2.set_xlabel("Total Conversion Amount ($)")
    ax2.set_ylabel("NPV Gap as % of Max Savings")
    ax2.set_title("DP Advantage Over Global Bracket-Fill — % of Max Savings")
    ax2.legend(loc="best", fontsize=9)
    ax2.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "combined_gap.png", dpi=150)
    plt.close(fig)


def plot_allocation_comparison(all_analyses: list[dict]):
    """Chart D: Side-by-side allocation comparison at the most divergent point."""
    meaningful = [a for a in all_analyses if a["max_savings"] > 500]
    if not meaningful:
        return

    n = len(meaningful)
    fig, axes = plt.subplots(n, 1, figsize=(12, 4 * n), squeeze=False)

    for i, analysis in enumerate(meaningful):
        ax = axes[i, 0]
        results = analysis["results"]
        worst = max(results, key=lambda r: abs(r["npv_diff"]))
        bf_alloc = worst["bf_alloc"]
        dp_alloc = worst["dp_alloc"]
        n_years = len(bf_alloc)

        # Find last year with any allocation
        max_show = 1
        for j in range(n_years - 1, -1, -1):
            if bf_alloc[j] > 100 or dp_alloc[j] > 100:
                max_show = j + 2  # +1 for index, +1 for context
                break
        max_show = min(max_show, n_years, 15)

        x = np.arange(max_show)
        width = 0.35
        ax.bar(x - width/2, [g/1000 for g in bf_alloc[:max_show]], width,
               label="Global Bracket-Fill", color="orange", alpha=0.8)
        ax.bar(x + width/2, [d/1000 for d in dp_alloc[:max_show]], width,
               label="DP-Optimal", color="blue", alpha=0.8)
        ax.set_ylabel("Conversion ($K)")
        ax.set_title(f"{analysis['name']}: Allocation at ${worst['target_total']:,.0f} "
                     f"(gap: ${worst['npv_diff']:,.0f})")
        ax.set_xticks(x)
        ax.set_xticklabels([f"Yr {j+1}" for j in range(max_show)], fontsize=8)
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3, axis="y")

    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "allocation_comparison.png", dpi=150)
    plt.close(fig)


def _safe_name(name: str) -> str:
    return name.lower().replace(" ", "_").replace("(", "").replace(")", "").replace(",", "")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("  OPTIMIZER DIVERGENCE INVESTIGATION")
    print("  Comparing DP-Optimal vs Global Bracket-Fill Heuristic")
    print("=" * 70)

    all_analyses = []
    for idx, (name, scenario) in enumerate(SCENARIOS.items()):
        analysis = analyze_scenario(name, scenario)
        all_analyses.append(analysis)
        plot_scenario(analysis, idx)

    plot_combined(all_analyses)
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
