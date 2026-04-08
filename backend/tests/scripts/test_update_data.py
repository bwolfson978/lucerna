"""Tests for the generalized data update script (scripts/update_data.py)."""

import json
from pathlib import Path

import pytest

from scripts.update_data import (
    DATA_DIR,
    discover_data_files,
    validate_metadata,
    validate_tax_brackets,
    validate_rmd_tables,
    validate_file,
    validate_all,
    scaffold_tax_brackets,
    scaffold_rmd_tables,
)


# ── Discovery ──


class TestDiscoverDataFiles:
    def test_finds_json_files(self):
        files = discover_data_files()
        assert len(files) >= 2
        stems = [f.stem for f in files]
        assert "rmd_tables" in stems
        assert "tax_brackets_2025" in stems

    def test_returns_sorted(self):
        files = discover_data_files()
        names = [f.name for f in files]
        assert names == sorted(names)


# ── Metadata validation ──


class TestValidateMetadata:
    def test_valid_metadata(self, tmp_path):
        data = {"metadata": {"last_updated": "2025-01-01", "description": "Test"}}
        filepath = tmp_path / "test.json"
        warnings = validate_metadata(data, filepath)
        # Only recommended field warning (notes)
        assert all("required" not in w for w in warnings)

    def test_missing_metadata_block(self, tmp_path):
        data = {"some_key": "some_value"}
        filepath = tmp_path / "test.json"
        warnings = validate_metadata(data, filepath)
        assert any("MISSING metadata block" in w for w in warnings)

    def test_missing_last_updated(self, tmp_path):
        data = {"metadata": {"description": "Test"}}
        filepath = tmp_path / "test.json"
        warnings = validate_metadata(data, filepath)
        assert any("last_updated" in w for w in warnings)

    def test_invalid_date_format(self, tmp_path):
        data = {"metadata": {"last_updated": "Jan 1 2025", "description": "Test"}}
        filepath = tmp_path / "test.json"
        warnings = validate_metadata(data, filepath)
        assert any("not YYYY-MM-DD" in w for w in warnings)

    def test_accepts_primary_source_as_description(self, tmp_path):
        data = {"metadata": {"last_updated": "2025-01-01", "primary_source": "IRS"}}
        filepath = tmp_path / "test.json"
        warnings = validate_metadata(data, filepath)
        assert not any("description field" in w for w in warnings)


# ── Tax bracket validation ──


class TestValidateTaxBrackets:
    def test_real_file_passes(self):
        filepath = DATA_DIR / "tax_brackets_2025.json"
        with open(filepath) as f:
            data = json.load(f)
        warnings = validate_tax_brackets(data, filepath)
        assert warnings == []

    def test_missing_federal(self, tmp_path):
        data = {"metadata": {}}
        filepath = tmp_path / "tax_brackets_2025.json"
        warnings = validate_tax_brackets(data, filepath)
        assert any("missing 'federal'" in w for w in warnings)

    def test_non_ascending_rates(self, tmp_path):
        data = {
            "federal": {
                "standard_deduction": {"single": 15000, "married_filing_jointly": 30000},
                "brackets": {
                    "single": [
                        {"min": 0, "max": 10000, "rate": 0.12},
                        {"min": 10000, "max": "inf", "rate": 0.10},
                    ],
                    "married_filing_jointly": [],
                },
            }
        }
        filepath = tmp_path / "tax_brackets_2025.json"
        warnings = validate_tax_brackets(data, filepath)
        assert any("not ascending" in w for w in warnings)

    def test_gap_between_brackets(self, tmp_path):
        data = {
            "federal": {
                "standard_deduction": {"single": 15000, "married_filing_jointly": 30000},
                "brackets": {
                    "single": [
                        {"min": 0, "max": 10000, "rate": 0.10},
                        {"min": 11000, "max": "inf", "rate": 0.12},
                    ],
                    "married_filing_jointly": [],
                },
            }
        }
        filepath = tmp_path / "tax_brackets_2025.json"
        warnings = validate_tax_brackets(data, filepath)
        assert any("gap" in w for w in warnings)


# ── RMD validation ──


class TestValidateRmdTables:
    def test_real_file_passes(self):
        filepath = DATA_DIR / "rmd_tables.json"
        with open(filepath) as f:
            data = json.load(f)
        warnings = validate_rmd_tables(data, filepath)
        assert warnings == []

    def test_non_monotonic_entries(self, tmp_path):
        data = {
            "uniform_lifetime_table": {
                "min_age": 72,
                "entries": {"72": 27.4, "73": 28.0},  # Increases — invalid
            },
            "start_age_rules": {"rules": [{"born_on_or_before": None, "rmd_start_age": 72}]},
        }
        filepath = tmp_path / "rmd_tables.json"
        warnings = validate_rmd_tables(data, filepath)
        assert any("monotonically decreasing" in w for w in warnings)

    def test_min_age_mismatch(self, tmp_path):
        data = {
            "uniform_lifetime_table": {
                "min_age": 75,
                "entries": {"72": 27.4, "73": 26.5},
            },
            "start_age_rules": {"rules": [{"born_on_or_before": None, "rmd_start_age": 72}]},
        }
        filepath = tmp_path / "rmd_tables.json"
        warnings = validate_rmd_tables(data, filepath)
        assert any("min_age" in w and "does not match" in w for w in warnings)

    def test_last_rule_not_catchall(self, tmp_path):
        data = {
            "uniform_lifetime_table": {"min_age": 72, "entries": {"72": 27.4}},
            "start_age_rules": {
                "rules": [{"born_on_or_before": 1959, "rmd_start_age": 73}]
            },
        }
        filepath = tmp_path / "rmd_tables.json"
        warnings = validate_rmd_tables(data, filepath)
        assert any("catch-all" in w for w in warnings)

    def test_min_age_greater_than_earliest_start(self, tmp_path):
        data = {
            "uniform_lifetime_table": {
                "min_age": 75,
                "entries": {"75": 24.6},
            },
            "start_age_rules": {
                "rules": [
                    {"born_on_or_before": 1950, "rmd_start_age": 72},
                    {"born_on_or_before": None, "rmd_start_age": 75},
                ]
            },
        }
        filepath = tmp_path / "rmd_tables.json"
        warnings = validate_rmd_tables(data, filepath)
        assert any("greater than earliest RMD start age" in w for w in warnings)


# ── Full file validation ──


class TestValidateAll:
    def test_all_real_files_pass(self):
        warnings = validate_all()
        assert warnings == [], f"Unexpected warnings: {warnings}"


# ── Scaffold ──


class TestScaffoldTaxBrackets:
    def test_bumps_year(self):
        data = {
            "metadata": {"tax_year": 2025, "last_updated": "2025-01-01"},
            "federal": {"brackets": {}, "standard_deduction": {}},
        }
        result = scaffold_tax_brackets(data, 2027)
        assert result["metadata"]["tax_year"] == 2027

    def test_preserves_federal_data(self):
        data = {
            "metadata": {"tax_year": 2025, "last_updated": "2025-01-01"},
            "federal": {"standard_deduction": {"single": 15000}, "brackets": {"single": []}},
        }
        result = scaffold_tax_brackets(data, 2027)
        assert result["federal"]["standard_deduction"]["single"] == 15000


class TestScaffoldRmdTables:
    def test_updates_metadata(self):
        data = {
            "metadata": {
                "last_updated": "2025-01-01",
                "notes": "Original notes.",
            },
            "uniform_lifetime_table": {},
        }
        result = scaffold_rmd_tables(data, 2027)
        assert "REVIEW 2027" in result["metadata"]["notes"]
        assert "Original notes." in result["metadata"]["notes"]
