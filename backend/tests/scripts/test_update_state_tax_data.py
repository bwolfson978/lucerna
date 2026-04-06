"""Tests for the state tax data update tool."""

import json
import shutil
from pathlib import Path

import pytest

from scripts.update_state_tax_data import (
    load_current_data,
    validate_against_current,
    build_scaffold,
    print_summary,
    NO_TAX_STATES,
)

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


class TestLoadCurrentData:
    def test_loads_existing_json(self):
        data = load_current_data()
        assert "metadata" in data
        assert "federal" in data
        assert "states" in data
        assert data["metadata"]["tax_year"] == 2025

    def test_has_all_states(self):
        data = load_current_data()
        states = data["states"]
        # 50 states + DC = 51
        assert len(states) == 51

    def test_no_tax_states_present(self):
        data = load_current_data()
        for code in NO_TAX_STATES:
            assert code in data["states"], f"Missing no-tax state: {code}"
            assert data["states"][code]["has_income_tax"] is False


class TestValidateAgainstCurrent:
    def test_no_warnings_for_identical_data(self):
        data = load_current_data()
        warnings = validate_against_current(data, data)
        assert len(warnings) == 0

    def test_detects_missing_state(self):
        current = load_current_data()
        new_data = load_current_data()
        del new_data["states"]["CA"]
        warnings = validate_against_current(new_data, current)
        assert any("MISSING STATE: CA" in w for w in warnings)

    def test_detects_new_state(self):
        current = load_current_data()
        new_data = load_current_data()
        new_data["states"]["ZZ"] = {"name": "Fictional", "has_income_tax": True}
        warnings = validate_against_current(new_data, current)
        assert any("NEW STATE: ZZ" in w for w in warnings)

    def test_detects_tax_type_change(self):
        current = load_current_data()
        new_data = load_current_data()
        # Change CA from progressive to flat
        new_data["states"]["CA"]["tax_type"] = "flat"
        warnings = validate_against_current(new_data, current)
        assert any("TAX TYPE CHANGED: CA" in w for w in warnings)

    def test_detects_large_rate_change(self):
        current = load_current_data()
        new_data = load_current_data()
        # Bump CA top rate by 5 percentage points
        ca_brackets = new_data["states"]["CA"]["brackets"]["single"]
        ca_brackets[-1]["rate"] = 0.183  # 18.3% (from 13.3%)
        warnings = validate_against_current(new_data, current)
        assert any("LARGE RATE CHANGE: CA" in w for w in warnings)


class TestBuildScaffold:
    def test_scaffold_has_correct_year(self):
        scaffold = build_scaffold(2099)
        assert scaffold["metadata"]["tax_year"] == 2099

    def test_scaffold_preserves_state_count(self):
        current = load_current_data()
        scaffold = build_scaffold(2099)
        assert len(scaffold["states"]) == len(current["states"])

    def test_scaffold_preserves_federal_brackets(self):
        current = load_current_data()
        scaffold = build_scaffold(2099)
        assert scaffold["federal"]["brackets"] == current["federal"]["brackets"]

    def test_scaffold_metadata_notes_review_needed(self):
        scaffold = build_scaffold(2099)
        assert "Review" in scaffold["metadata"]["notes"] or "review" in scaffold["metadata"]["notes"]


class TestJsonIntegrity:
    """Tests that the JSON file itself is well-formed and complete."""

    def test_json_is_valid(self):
        json_path = sorted(DATA_DIR.glob("tax_brackets_*.json"))[-1]
        with open(json_path, "r") as f:
            data = json.load(f)
        assert isinstance(data, dict)

    def test_all_bracket_states_have_both_filing_statuses(self):
        data = load_current_data()
        for code, state in data["states"].items():
            if not state.get("has_income_tax"):
                continue
            brackets = state.get("brackets", {})
            assert "single" in brackets, f"{code} missing single brackets"
            assert "married_filing_jointly" in brackets, f"{code} missing MFJ brackets"

    def test_brackets_are_contiguous(self):
        """Verify bracket min/max values form a contiguous range (no gaps)."""
        data = load_current_data()
        for code, state in data["states"].items():
            if not state.get("has_income_tax"):
                continue
            for fs in ["single", "married_filing_jointly"]:
                brackets = state.get("brackets", {}).get(fs, [])
                for i in range(1, len(brackets)):
                    prev_max = brackets[i - 1]["max"]
                    curr_min = brackets[i]["min"]
                    if prev_max == "inf":
                        continue
                    assert prev_max == curr_min, (
                        f"{code} {fs}: gap between bracket {i-1} max ({prev_max}) "
                        f"and bracket {i} min ({curr_min})"
                    )

    def test_bracket_rates_are_non_negative(self):
        data = load_current_data()
        for code, state in data["states"].items():
            if not state.get("has_income_tax"):
                continue
            for fs in ["single", "married_filing_jointly"]:
                brackets = state.get("brackets", {}).get(fs, [])
                for bracket in brackets:
                    assert bracket["rate"] >= 0, (
                        f"{code} {fs}: negative rate {bracket['rate']}"
                    )

    def test_last_bracket_has_inf_max(self):
        data = load_current_data()
        for code, state in data["states"].items():
            if not state.get("has_income_tax"):
                continue
            for fs in ["single", "married_filing_jointly"]:
                brackets = state.get("brackets", {}).get(fs, [])
                if brackets:
                    assert brackets[-1]["max"] == "inf", (
                        f"{code} {fs}: last bracket max should be 'inf', "
                        f"got {brackets[-1]['max']}"
                    )

    def test_federal_brackets_present(self):
        data = load_current_data()
        federal = data["federal"]
        assert "standard_deduction" in federal
        assert "brackets" in federal
        assert len(federal["brackets"]["single"]) == 7
        assert len(federal["brackets"]["married_filing_jointly"]) == 7

    def test_metadata_has_required_fields(self):
        data = load_current_data()
        meta = data["metadata"]
        assert "tax_year" in meta
        assert "primary_source" in meta
        assert "primary_source_url" in meta
        assert "last_updated" in meta
