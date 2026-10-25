"""Regenerate shared/fixtures/scenario-draft-cases.json from the reference draft rules.

Run from backend/:  python -m scripts.generate_draft_fixtures

The frontend parity test (frontend/src/lib/scenario/__tests__/draft.test.ts) checks
that the TypeScript draft rules produce the same timelines, scenarios and missing
fields as backend/app/tools/draft.py.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.tools.draft import ScenarioDraft, build_scenario_input, missing_fields, sync_timeline

OUTPUT = Path(__file__).resolve().parents[2] / "shared" / "fixtures" / "scenario-draft-cases.json"
START_YEAR = 2026

BUILD_CASES: list[tuple[str, dict]] = [
    (
        "working, single, federal only",
        dict(
            birth_year=1981,
            birth_month=6,
            filing_status="single",
            current_income=85000,
            traditional_balance=250000,
            retirement_age=65,
        ),
    ),
    (
        "married with state, roth, spending, custom assumptions",
        dict(
            birth_year=1974,
            birth_month=6,
            filing_status="married_filing_jointly",
            spouse_birth_year=1968,
            spouse_birth_month=9,
            current_income=90000,
            income_growth_rate_pct=2.5,
            traditional_balance=600000,
            roth_balance=40000,
            retirement_age=60,
            retirement_spending=80000,
            state="CA",
            retirement_state="TX",
            planning_horizon_age=95,
            investment_return_pct=6,
            discount_rate_pct=4,
        ),
    ),
    (
        "retirement state same as state is dropped",
        dict(
            birth_year=1986,
            birth_month=6,
            filing_status="single",
            current_income=120000,
            traditional_balance=300000,
            retirement_age=55,
            state="NY",
            retirement_state="NY",
        ),
    ),
    (
        "already retired keeps income for life",
        dict(
            birth_year=1960,
            birth_month=6,
            filing_status="married_filing_jointly",
            spouse_birth_year=1968,
            spouse_birth_month=9,
            current_income=30000,
            income_growth_rate_pct=0,
            traditional_balance=900000,
            retirement_age=62,
        ),
    ),
    (
        "custom state rate and ACA",
        dict(
            birth_year=1968,
            birth_month=6,
            filing_status="single",
            current_income=45000,
            traditional_balance=500000,
            retirement_age=63,
            state="custom",
            custom_state_rate_pct=4.5,
            include_aca=True,
            household_size=2,
            monthly_slcsp_premium=900,
            employer_coverage_year=2029,
        ),
    ),
    (
        "half-dollar growth rounding",
        dict(
            birth_year=1996,
            birth_month=6,
            filing_status="single",
            current_income=50001,
            income_growth_rate_pct=3,
            traditional_balance=10000,
            retirement_age=40,
        ),
    ),
    (
        "income sources replace current income",
        dict(
            birth_year=1963,
            birth_month=6,
            filing_status="married_filing_jointly",
            spouse_birth_year=1968,
            spouse_birth_month=9,
            current_income=20000,
            income_growth_rate_pct=0,
            current_income_end_age=66,
            traditional_balance=1400000,
            roth_balance=52000,
            retirement_age=73,
            retirement_spending=95000,
            planning_horizon_age=93,
            income_sources=[
                {"kind": "social_security", "owner": "you", "amount": 46000, "start_age": 67},
                {"kind": "social_security", "owner": "spouse", "amount": 14000, "start_age": 68},
                {
                    "kind": "pension",
                    "owner": "you",
                    "label": "Bridge",
                    "amount": 5000.5,
                    "start_age": 64,
                    "end_age": 66,
                },
            ],
        ),
    ),
    (
        "inflation: raises less inflation, pension shrinks, Social Security keeps up",
        dict(
            birth_year=1971,
            birth_month=6,
            filing_status="single",
            current_income=100000,
            income_growth_rate_pct=3,
            inflation_pct=3.5,
            traditional_balance=800000,
            retirement_age=62,
            income_sources=[
                {"kind": "social_security", "owner": "you", "amount": 30000, "start_age": 67},
                {"kind": "pension", "owner": "you", "amount": 24000.5, "start_age": 62},
                {"kind": "other", "owner": "you", "amount": 6000, "start_age": 60, "end_age": 70},
            ],
        ),
    ),
    (
        "no inflation",
        dict(
            birth_year=1966,
            birth_month=6,
            filing_status="single",
            current_income=80000,
            inflation_pct=0,
            traditional_balance=400000,
            retirement_age=65,
            income_sources=[{"kind": "pension", "owner": "you", "amount": 12000, "start_age": 65}],
        ),
    ),
    (
        "zero spending means 4% rule",
        dict(
            birth_year=1976,
            birth_month=6,
            filing_status="single",
            current_income=70000,
            traditional_balance=200000,
            retirement_age=60,
            retirement_spending=0,
        ),
    ),
    (
        "retired couple, no work income, Social Security later",
        dict(
            birth_year=1960,
            birth_month=6,
            filing_status="married_filing_jointly",
            spouse_birth_year=1968,
            spouse_birth_month=9,
            state="FL",
            current_income=0,
            traditional_balance=2600000,
            roth_balance=80000,
            retirement_age=65,
            retirement_spending=130000,
            income_sources=[
                {"kind": "social_security", "owner": "you", "amount": 42000, "start_age": 67},
                {"kind": "social_security", "owner": "spouse", "amount": 30000, "start_age": 67},
            ],
        ),
    ),
]

MISSING_CASES: list[tuple[str, dict]] = [
    ("empty", {}),
    ("partial", dict(birth_year=1981, filing_status="single")),
    (
        "joint without the spouse's birth date",
        dict(birth_year=1981, birth_month=6, filing_status="married_filing_jointly"),
    ),
    (
        "saved with only an age",
        dict(age=66, timeline=[{"year": 2026, "gross_income": 0}]),
    ),
    (
        "zero income",
        dict(
            birth_year=1981,
            birth_month=6,
            filing_status="single",
            current_income=0,
            traditional_balance=1000,
            retirement_age=60,
        ),
    ),
    (
        "zero traditional balance",
        dict(
            birth_year=1981,
            birth_month=6,
            filing_status="single",
            current_income=50000,
            traditional_balance=0,
            retirement_age=60,
        ),
    ),
]


def build() -> dict:
    cases = []
    for name, values in BUILD_CASES:
        draft = ScenarioDraft(**values)
        sync_timeline(draft, None, START_YEAR)
        cases.append(
            {
                "name": name,
                "start_year": START_YEAR,
                "draft": values,
                "timeline": [
                    row.model_dump(mode="json", exclude_none=True, exclude_defaults=True)
                    for row in draft.timeline
                ],
                "scenario": build_scenario_input(draft).model_dump(mode="json", exclude_none=True),
            }
        )
    missing = [
        {"name": name, "draft": values, "missing": missing_fields(ScenarioDraft(**values))}
        for name, values in MISSING_CASES
    ]
    return {
        "_comment": (
            "Shared parity cases for the scenario draft. Generated from "
            "backend/app/tools/draft.py (the reference). frontend/src/lib/scenario/draft.ts "
            "must produce the same timelines and scenarios. Regenerate with "
            "backend/scripts/generate_draft_fixtures.py."
        ),
        "build": cases,
        "missing": missing,
    }


if __name__ == "__main__":
    OUTPUT.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"Wrote {OUTPUT}")
