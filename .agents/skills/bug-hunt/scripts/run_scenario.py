#!/usr/bin/env python3
"""Run one scenario through this checkout's engine and print what a chat would be told.

The scenario is JSON with the same fields the prepare_scenario tool takes (see
backend/app/tools/models.py, ScenarioUpdate). Nothing leaves the machine: no model,
no network, no keys. Use it to pin the numbers behind a finding, or to check whether
a bug from an earlier list still shows on this checkout.

    python .agents/skills/bug-hunt/scripts/run_scenario.py scenario.json
    python .agents/skills/bug-hunt/scripts/run_scenario.py scenario.json --years 2026-2035
    python .agents/skills/bug-hunt/scripts/run_scenario.py scenario.json --what-if changes.json
    python .agents/skills/bug-hunt/scripts/run_scenario.py scenario.json --json > result.json

Pass - to read the scenario from stdin. --what-if runs the scenario and a changed copy,
the way compare_roth_scenarios does (changes.json holds only the values that differ).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Paths on the command line are relative to where the script was started; the backend
# reads its settings from its own folder.
STARTED_IN = Path.cwd()
BACKEND = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from app.tools import core  # noqa: E402
from app.tools.draft import ScenarioDraft, current_year  # noqa: E402
from app.tools.models import ScenarioUpdate  # noqa: E402

ROW_KEYS = (
    "year",
    "income",
    "conversion",
    "tax_on_conversion",
    "marginal_bracket",
    "rmd",
    "spending_from_traditional",
    "spending_from_roth",
)
SUMMARY_KEYS = ("early_withdrawal_summary", "aca_summary", "irmaa_summary", "rmd_summary")


def load(path: str) -> dict:
    text = sys.stdin.read() if path == "-" else (STARTED_IN / path).read_text()
    return json.loads(text)


def year_range(text: str | None) -> range | None:
    if not text:
        return None
    first, _, last = text.partition("-")
    return range(int(first), int(last or first) + 1)


def draft_for(base: ScenarioDraft, values: dict, year: int) -> ScenarioDraft:
    return core.apply_update(base, ScenarioUpdate.model_validate(values), year)


def summarize(draft: ScenarioDraft, year: int) -> dict:
    described = core.describe_draft(draft, year)
    if not described["ready_to_run"]:
        return {
            "ready_to_run": False,
            "missing_required": described["missing_required"],
            "problems": described["problems"],
            "scenario": described["scenario"],
        }
    scenario, result = core.run_draft(draft)
    summary = core.summarize_result(result, core.result_id_for(scenario))
    summary["scenario"] = described["scenario"]
    summary["projected_income"] = described["timeline"]
    return summary


def short(value, limit: int = 600) -> str:
    text = value if isinstance(value, str) else json.dumps(value)
    return text if len(text) <= limit else text[:limit] + " ..."


def print_summary(name: str, summary: dict, years: range | None) -> None:
    print(f"== {name}")
    if summary.get("ready_to_run") is False:
        print("  not ready to run")
        print("  missing:", ", ".join(summary["missing_required"]) or "nothing")
        print("  problems:", "; ".join(summary["problems"]) or "none")
        return
    print("  scenario as recorded:", json.dumps(summary["scenario"]))
    print(
        "  estimated lifetime tax savings (today's dollars):",
        f"${summary['estimated_lifetime_tax_savings_todays_dollars']:,}",
    )
    print(
        f"  converted ${summary['total_conversion']:,} over "
        f"{summary['years_with_conversions']} years, "
        f"tax on conversions ${summary['total_tax_on_conversions']:,}"
    )
    print("  alternatives:", json.dumps(summary["alternatives"]))
    print("  schedule:")
    for row in summary["schedule_by_year"]:
        if years is not None and row["year"] not in years:
            continue
        if years is None and not row["conversion"] and not row.get("rmd"):
            continue
        print("   ", json.dumps({k: row[k] for k in ROW_KEYS if k in row}))
    reasoning = summary["reasoning"]
    for key in ("binding_constraint", "cost_of_converting_more", "summary_points"):
        print(f"  {key}:", short(reasoning[key]))
    for key in SUMMARY_KEYS:
        if key in reasoning:
            print(f"  {key}:", short(reasoning[key]))
    print("  assumptions:", json.dumps(summary["assumptions"]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("scenario", help="scenario JSON file, or - for stdin")
    parser.add_argument("--what-if", help="JSON file with only the values that differ")
    parser.add_argument("--years", help="schedule years to print, e.g. 2026-2035")
    parser.add_argument("--start-year", type=int, help="plan's first year (default: this year)")
    parser.add_argument("--json", action="store_true", help="print everything as JSON")
    args = parser.parse_args()

    year = args.start_year or current_year()
    try:
        base = draft_for(ScenarioDraft(), load(args.scenario), year)
        out = {"scenario": summarize(base, year)}
        if args.what_if:
            variant = draft_for(base, load(args.what_if), year)
            out["what_if"] = summarize(variant, year)
            if out["scenario"].get("ready_to_run") is not False:
                _, base_result = core.run_draft(base)
                _, variant_result = core.run_draft(variant)
                out["comparison"] = core.compare_results(
                    base_result, variant_result, "base", "what_if", "What-if"
                )
    except (core.ToolError, ValueError) as err:
        sys.exit(f"The tools refused this scenario: {err}")

    if args.json:
        print(json.dumps(out, indent=1))
        return
    years = year_range(args.years)
    print_summary("scenario", out["scenario"], years)
    if "what_if" in out:
        print_summary("what-if", out["what_if"], years)
    if "comparison" in out:
        keys = ("estimated_lifetime_tax_savings", "total_conversion", "tax_breakdown")
        print("== comparison")
        for key in keys:
            print(f"  {key}:", json.dumps(out["comparison"][key]))


if __name__ == "__main__":
    main()
