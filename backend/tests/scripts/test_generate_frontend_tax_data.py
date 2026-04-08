"""Tests for the frontend tax data code generation script."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent.parent
SCRIPT = ROOT / "scripts" / "generate_frontend_tax_data.py"
BACKEND_DATA = ROOT / "backend" / "data" / "tax_brackets_2025.json"
FRONTEND_OUTPUT = ROOT / "frontend" / "src" / "lib" / "tax" / "federal-brackets-2025.json"


class TestGenerateScript:
    def test_script_exists(self):
        assert SCRIPT.exists()

    def test_check_mode_passes(self):
        """Frontend file should be in sync after generation."""
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--check"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "OK" in result.stdout

    def test_generated_json_is_valid(self):
        with open(FRONTEND_OUTPUT) as f:
            data = json.load(f)

        assert "standard_deduction" in data
        assert "brackets" in data
        assert "single" in data["brackets"]
        assert "married_filing_jointly" in data["brackets"]

    def test_brackets_use_null_not_inf(self):
        """Frontend uses null for unbounded max, not 'inf'."""
        with open(FRONTEND_OUTPUT) as f:
            data = json.load(f)

        for fs in ("single", "married_filing_jointly"):
            last = data["brackets"][fs][-1]
            assert last["max"] is None, f"Last bracket max should be null, got {last['max']}"

    def test_data_matches_backend(self):
        """Frontend data values must match backend federal data."""
        with open(BACKEND_DATA) as f:
            backend = json.load(f)
        with open(FRONTEND_OUTPUT) as f:
            frontend = json.load(f)

        backend_fed = backend["federal"]

        # Standard deductions match
        assert frontend["standard_deduction"] == backend_fed["standard_deduction"]

        # Bracket values match (accounting for inf -> null conversion)
        for fs in ("single", "married_filing_jointly"):
            for i, (be, fe) in enumerate(
                zip(backend_fed["brackets"][fs], frontend["brackets"][fs])
            ):
                assert be["min"] == fe["min"], f"{fs}[{i}] min mismatch"
                assert be["rate"] == fe["rate"], f"{fs}[{i}] rate mismatch"
                if be["max"] == "inf":
                    assert fe["max"] is None, f"{fs}[{i}] max should be null"
                else:
                    assert be["max"] == fe["max"], f"{fs}[{i}] max mismatch"

    def test_metadata_has_auto_generated_note(self):
        with open(FRONTEND_OUTPUT) as f:
            data = json.load(f)
        notes = data.get("metadata", {}).get("notes", "")
        assert "auto-generated" in notes
