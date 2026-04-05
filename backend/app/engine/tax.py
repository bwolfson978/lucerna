"""Federal income tax bracket calculations.

Loads bracket data from the static JSON configuration file
(backend/data/tax_brackets_2025.json). The JSON is the single source of
truth for all federal and state tax brackets.

Source: IRS Revenue Procedure 2024-40 (2025 tax year)
"""

import json
import numpy as np
from pathlib import Path

from app.engine.types import FilingStatus, BracketFillResult


# ==============================================
# Load federal bracket data from JSON at module init
# ==============================================

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

_FILING_STATUS_KEY = {
    FilingStatus.SINGLE: "single",
    FilingStatus.MFJ: "married_filing_jointly",
}


def _load_federal_data() -> dict:
    """Load federal bracket data from the tax brackets JSON file."""
    data_file = _DATA_DIR / "tax_brackets_2025.json"
    with open(data_file, "r") as f:
        data = json.load(f)

    federal = data["federal"]

    # Convert "inf" strings to float("inf") in bracket max values
    for filing_status, bracket_list in federal["brackets"].items():
        for bracket in bracket_list:
            if bracket["max"] == "inf":
                bracket["max"] = float("inf")

    return federal


_FEDERAL_DATA = _load_federal_data()


def _get_brackets(filing_status: FilingStatus) -> list[dict]:
    """Get the federal bracket list for a filing status."""
    fs_key = _FILING_STATUS_KEY[filing_status]
    return _FEDERAL_DATA["brackets"][fs_key]


def _get_deduction(filing_status: FilingStatus) -> float:
    """Get the federal standard deduction for a filing status."""
    fs_key = _FILING_STATUS_KEY[filing_status]
    return _FEDERAL_DATA["standard_deduction"][fs_key]


# Expose as module-level dicts for backward compatibility with code that
# imports BRACKETS and STANDARD_DEDUCTION directly (optimizer, heuristic, etc.)
BRACKETS = {
    FilingStatus.SINGLE: _get_brackets(FilingStatus.SINGLE),
    FilingStatus.MFJ: _get_brackets(FilingStatus.MFJ),
}

STANDARD_DEDUCTION = {
    FilingStatus.SINGLE: _get_deduction(FilingStatus.SINGLE),
    FilingStatus.MFJ: _get_deduction(FilingStatus.MFJ),
}


def calculate_federal_tax(
    gross_income: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> float:
    """Calculate federal income tax using progressive brackets.

    Takes gross income and subtracts the standard deduction internally.
    """
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable_income = max(0, gross_income - deduction)
    brackets = BRACKETS[filing_status]

    tax = 0.0
    for bracket in brackets:
        if taxable_income <= bracket["min"]:
            break
        taxable_in_bracket = min(taxable_income, bracket["max"]) - bracket["min"]
        tax += taxable_in_bracket * bracket["rate"]

    return tax


def get_marginal_rate(
    gross_income: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> float:
    """Get the marginal tax rate at a given gross income level."""
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable_income = max(0, gross_income - deduction)
    brackets = BRACKETS[filing_status]

    for bracket in brackets:
        if taxable_income >= bracket["min"] and taxable_income < bracket["max"]:
            return bracket["rate"]

    return brackets[-1]["rate"]


def vectorized_federal_tax(
    gross_incomes: np.ndarray,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> np.ndarray:
    """Calculate federal income tax for an array of gross incomes.

    Vectorized equivalent of calculate_federal_tax for numpy arrays.
    """
    deduction = STANDARD_DEDUCTION[filing_status]
    taxable = np.maximum(0.0, gross_incomes - deduction)
    brackets = BRACKETS[filing_status]

    tax = np.zeros_like(taxable)
    for bracket in brackets:
        bracket_max = bracket["max"]
        # Use a large finite number instead of inf for numpy compatibility
        if bracket_max == float("inf"):
            bracket_max = 1e18
        in_bracket = np.minimum(taxable, bracket_max) - bracket["min"]
        in_bracket = np.maximum(0.0, in_bracket)
        tax += in_bracket * bracket["rate"]

    return tax


def analyze_bracket_fill(
    base_income: float,
    conversion_amount: float,
    filing_status: FilingStatus = FilingStatus.SINGLE,
) -> list[BracketFillResult]:
    """Generate bracket fill analysis for the bracket visualization."""
    deduction = STANDARD_DEDUCTION[filing_status]
    base_taxable = max(0, base_income - deduction)
    total_taxable = max(0, base_income + conversion_amount - deduction)
    brackets = BRACKETS[filing_status]

    results = []
    for bracket in brackets:
        if bracket["max"] == float("inf"):
            capacity = 500000.0
        else:
            capacity = bracket["max"] - bracket["min"]

        filled_by_income = max(0, min(base_taxable, bracket["max"]) - bracket["min"])
        total_filled = max(0, min(total_taxable, bracket["max"]) - bracket["min"])
        filled_by_conversion = total_filled - filled_by_income
        remaining = max(0, capacity - total_filled)
        tax_in_bracket = total_filled * bracket["rate"]

        display_max = bracket["max"] if bracket["max"] != float("inf") else bracket["min"] + 500000

        results.append(BracketFillResult(
            bracket_rate=bracket["rate"],
            bracket_min=bracket["min"],
            bracket_max=display_max,
            bracket_capacity=capacity,
            filled_by_income=filled_by_income,
            filled_by_conversion=filled_by_conversion,
            remaining_capacity=remaining,
            tax_in_bracket=tax_in_bracket,
        ))

        if total_taxable <= bracket["max"]:
            break

    return results
