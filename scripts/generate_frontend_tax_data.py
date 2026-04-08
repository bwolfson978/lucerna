#!/usr/bin/env python3
"""Generate frontend tax data from the backend's single-source-of-truth JSON files.

Reads backend/data/tax_brackets_2025.json and writes
frontend/src/lib/tax/federal-brackets-2025.json with the frontend-compatible
format (null instead of "inf", metadata trimmed to frontend needs).

This eliminates manual duplication — the frontend JSON is always derived from
the backend data. Run this as part of the build or pre-commit workflow.

Usage:
    python scripts/generate_frontend_tax_data.py
    python scripts/generate_frontend_tax_data.py --check   # CI: verify in sync
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DATA = ROOT / "backend" / "data" / "tax_brackets_2025.json"
FRONTEND_OUTPUT = ROOT / "frontend" / "src" / "lib" / "tax" / "federal-brackets-2025.json"

HEADER_COMMENT = (
    "This file is auto-generated from backend/data/tax_brackets_2025.json.\n"
    "Do not edit manually — run: python scripts/generate_frontend_tax_data.py"
)


def load_backend_data() -> dict:
    """Load the backend tax brackets JSON."""
    with open(BACKEND_DATA, "r") as f:
        return json.load(f)


def transform_brackets(backend_brackets: list[dict]) -> list[dict]:
    """Convert backend bracket format to frontend format.

    Backend uses "inf" string for unbounded max; frontend uses null.
    """
    result = []
    for b in backend_brackets:
        entry = {
            "min": b["min"],
            "max": None if b["max"] == "inf" else b["max"],
            "rate": b["rate"],
        }
        result.append(entry)
    return result


def generate_frontend_json(backend_data: dict) -> dict:
    """Transform backend data into frontend-compatible JSON."""
    federal = backend_data["federal"]
    backend_meta = backend_data.get("metadata", {})

    frontend_json = {
        "metadata": {
            "tax_year": backend_meta.get("tax_year", 2025),
            "source": backend_meta.get("federal_source", "IRS Revenue Procedure 2024-40"),
            "notes": f"{HEADER_COMMENT}",
        },
        "standard_deduction": federal["standard_deduction"],
        "brackets": {
            "single": transform_brackets(federal["brackets"]["single"]),
            "married_filing_jointly": transform_brackets(
                federal["brackets"]["married_filing_jointly"]
            ),
        },
    }

    return frontend_json


def main():
    parser = argparse.ArgumentParser(
        description="Generate frontend tax data from backend JSON."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check that the frontend file is in sync with the backend (for CI)",
    )
    args = parser.parse_args()

    if not BACKEND_DATA.exists():
        print(f"ERROR: Backend data file not found: {BACKEND_DATA}")
        sys.exit(1)

    backend_data = load_backend_data()
    generated = generate_frontend_json(backend_data)

    if args.check:
        # Compare generated output to current frontend file
        if not FRONTEND_OUTPUT.exists():
            print(f"FAIL: Frontend file does not exist: {FRONTEND_OUTPUT}")
            sys.exit(1)

        with open(FRONTEND_OUTPUT, "r") as f:
            current = json.load(f)

        # Compare the data-bearing keys (ignore metadata.notes since it has the header comment)
        generated_data = {
            "standard_deduction": generated["standard_deduction"],
            "brackets": generated["brackets"],
        }
        current_data = {
            "standard_deduction": current.get("standard_deduction"),
            "brackets": current.get("brackets"),
        }

        if generated_data != current_data:
            print("FAIL: Frontend tax data is out of sync with backend.")
            print("Run: python scripts/generate_frontend_tax_data.py")
            sys.exit(1)

        print("OK: Frontend tax data is in sync with backend.")
        return

    # Generate and write
    output_str = json.dumps(generated, indent=2) + "\n"

    FRONTEND_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(FRONTEND_OUTPUT, "w") as f:
        f.write(output_str)

    print(f"Generated: {FRONTEND_OUTPUT}")
    print(f"  Source:  {BACKEND_DATA}")
    print(f"  Tax year: {generated['metadata']['tax_year']}")
    print(f"  Brackets: single={len(generated['brackets']['single'])}, "
          f"MFJ={len(generated['brackets']['married_filing_jointly'])}")


if __name__ == "__main__":
    main()
