"""Ties the Lean models in formal/lean to the engine.

The Lean proofs are about transcriptions of the engine code and of the 2026 data.
These tests check the transcriptions still match: the bracket tables meet the
premises of `loop_eq_vec`, the Lean bracket constants equal the JSON, and the
Python Social Security formula agrees with the IRS worksheet the Lean model
proves it equal to. The xfail test is the RMD counterexample.
"""

import json
import re
from pathlib import Path

import numpy as np
import pytest

from app.engine.optimizer import _build_rmd_projection
from app.engine.rmd import rmd_start_age
from app.engine.tax import BRACKETS, calculate_federal_tax, vectorized_federal_tax
from app.engine.types import FilingStatus, PlanYear, ScenarioInput
from app.engine.year_tax import SS_THRESHOLDS, taxable_social_security

ROOT = Path(__file__).resolve().parents[3]
DATA = json.loads((ROOT / "backend" / "data" / "tax_brackets_2026.json").read_text())
LEAN = ROOT / "formal" / "lean" / "Lucerna"


def _tables():
    yield "federal", DATA["federal"]["brackets"]
    for state, entry in DATA["states"].items():
        if isinstance(entry.get("brackets"), dict):
            yield state, entry["brackets"]


@pytest.mark.parametrize(
    "name,tables", list(_tables()), ids=lambda v: v if isinstance(v, str) else ""
)
def test_bracket_tables_meet_the_lean_premises(name, tables):
    """loop_eq_vec needs ascending mins and non-empty brackets; the slope theorems also
    use contiguity, ascending rates and an open top bracket."""
    for status, brackets in tables.items():
        if not isinstance(brackets, list):
            continue
        prev_max = 0
        rates = []
        for b in brackets:
            top = float("inf") if b["max"] == "inf" else b["max"]
            assert b["min"] == prev_max, f"{name} {status}: gap or overlap at {b}"
            assert top > b["min"], f"{name} {status}: empty bracket {b}"
            rates.append(b["rate"])
            prev_max = top
        assert prev_max == float("inf"), f"{name} {status}: top bracket is capped"
        assert rates == sorted(rates), f"{name} {status}: rates go down"


def test_lean_federal_brackets_match_the_data():
    lean = (LEAN / "FederalTax.lean").read_text()
    for key in ("single", "mfj"):
        block = re.search(rf"def {key} : List Bracket :=\s*\[(.*?)\]", lean, re.S).group(1)
        triples = re.findall(r"⟨(\d+), (\w+), (\d+)⟩", block)
        status = FilingStatus.SINGLE if key == "single" else FilingStatus.MFJ
        expected = [
            (b["min"], "TOP" if b["max"] == float("inf") else b["max"], round(b["rate"] * 100))
            for b in BRACKETS[status]
        ]
        got = [(int(lo), hi if hi == "TOP" else int(hi), int(r)) for lo, hi, r in triples]
        assert got == expected, "update formal/lean/Lucerna/FederalTax.lean for the new table"


@pytest.mark.parametrize("status", [FilingStatus.SINGLE, FilingStatus.MFJ])
def test_loop_and_vectorized_tax_agree(status):
    incomes = np.linspace(0, 1_500_000, 3001)
    vec = vectorized_federal_tax(incomes, status)
    loop = [calculate_federal_tax(float(x), status) for x in incomes]
    assert np.allclose(vec, loop)


def _worksheet(other: float, benefits: float, low: float, high: float) -> float:
    """IRS Publication 915 Worksheet 1, as in SocialSecurity.lean."""
    line9 = other + benefits / 2
    if low >= line9:
        return 0.0
    line11 = line9 - low
    line12 = high - low
    line13 = max(0.0, line11 - line12)
    line16 = min(benefits / 2, min(line11, line12) / 2)
    return min(line16 + 0.85 * line13, 0.85 * benefits)


@pytest.mark.parametrize("status", [FilingStatus.SINGLE, FilingStatus.MFJ])
@pytest.mark.parametrize("scale", [1.0, 0.8])
def test_social_security_matches_the_worksheet(status, scale):
    low, high = (t * scale for t in SS_THRESHOLDS[status])
    for benefits in (1_000, 18_000, 40_000, 90_000):
        for other in range(0, 120_001, 250):
            got = taxable_social_security(float(other), benefits, status, scale)
            assert got == pytest.approx(_worksheet(other, benefits, low, high), abs=1e-6)


def test_rmd_start_age_rules_match_the_lean_model():
    lean = (LEAN / "RmdStartAge.lean").read_text()
    assert "if birthYear ≤ 1950 then 72 else if birthYear ≤ 1959 then 73 else 75" in lean
    for birth_year, start in ((1950, 72), (1951, 73), (1959, 73), (1960, 75)):
        assert rmd_start_age(2026 - birth_year, 2026) == start


@pytest.mark.xfail(
    strict=True,
    reason="RmdStartAge engine_misses_spec_from_2027: every "
    "caller uses rmd_start_age(scenario.age), which assumes the plan "
    "starts in 2026",
)
def test_rmds_start_by_birth_year_for_a_plan_starting_in_2027():
    # Born 1960: RMDs start at 75. In a plan built in 2027 this person is 67.
    scenario = ScenarioInput(
        age=67,
        filing_status=FilingStatus.SINGLE,
        timeline=[PlanYear(year=2027 + t, gross_income=30_000) for t in range(24)],
        traditional_ira_balance=800_000,
        drawdown_start_age=67,
        planning_horizon_age=90,
    )
    projection = _build_rmd_projection(scenario, [0.0] * len(scenario.timeline))
    assert projection.rmd_start_age == 75
    assert projection.rmd_start_year == 2035
