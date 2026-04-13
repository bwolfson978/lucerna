"""State income tax bracket data and calculation functions.

Loads bracket data from the static JSON configuration file
(backend/data/tax_brackets_2026.json). The JSON is the single source of
truth for all state tax brackets, standard deductions, and metadata.

Source: Tax Foundation — State Individual Income Tax Rates and Brackets
https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/
Verified against official state department of revenue publications.
"""

import json
from pathlib import Path

import numpy as np

from app.engine.constants import NUMERIC_INFINITY
from app.engine.types import FilingStatus

__all__ = [
    "resolve_state_for_year",
    "calculate_state_tax",
    "get_state_marginal_rate",
    "vectorized_state_tax",
    "get_supported_states",
    "get_all_states",
    "get_tax_data_metadata",
]


# ==============================================
# Load bracket data from JSON at module init
# ==============================================

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_tax_data() -> dict:
    """Load and parse the tax brackets JSON file.

    Converts "inf" strings back to float("inf") for bracket max values.
    Returns the full parsed data dict.
    """
    data_file = _DATA_DIR / "tax_brackets_2026.json"
    try:
        with open(data_file) as f:
            data = json.load(f)
    except FileNotFoundError as err:
        raise RuntimeError(
            f"Tax data file not found at {data_file}. "
            f"Ensure backend/data/tax_brackets_2026.json exists."
        ) from err
    except json.JSONDecodeError as err:
        raise RuntimeError(f"Tax data file is malformed: {err}") from err

    # Convert "inf" strings to float("inf") in bracket max values
    for section_key in ["federal", "states"]:
        section = data.get(section_key, {})
        entries = section.items() if section_key == "states" else [("federal", section)]

        for _key, entry in entries:
            if section_key == "states" and not entry.get("has_income_tax", False):
                continue
            brackets = entry.get("brackets", {})
            for _filing_status, bracket_list in brackets.items():
                for bracket in bracket_list:
                    if bracket["max"] == "inf":
                        bracket["max"] = float("inf")

    return data


_TAX_DATA = _load_tax_data()

# Build lookup dicts keyed by FilingStatus enum for state brackets
_FILING_STATUS_KEY = {
    FilingStatus.SINGLE: "single",
    FilingStatus.MFJ: "married_filing_jointly",
}


def _get_state_data(state: str) -> dict | None:
    """Get the state entry from loaded tax data, or None if not found."""
    return _TAX_DATA.get("states", {}).get(state)


def _get_deduction(state: str, filing_status: FilingStatus) -> float:
    """Get the standard deduction for a state."""
    state_data = _get_state_data(state)
    if not state_data:
        return _get_federal_deduction(filing_status)
    deductions = state_data.get("standard_deduction", {})
    fs_key = _FILING_STATUS_KEY[filing_status]
    return deductions.get(fs_key, _get_federal_deduction(filing_status))


def _get_federal_deduction(filing_status: FilingStatus) -> float:
    """Get the federal standard deduction from loaded data."""
    fs_key = _FILING_STATUS_KEY[filing_status]
    return _TAX_DATA["federal"]["standard_deduction"][fs_key]


def _get_brackets(state: str, filing_status: FilingStatus) -> list[dict] | None:
    """Get the bracket list for a state and filing status."""
    state_data = _get_state_data(state)
    if not state_data or not state_data.get("has_income_tax", False):
        return None
    brackets = state_data.get("brackets", {})
    fs_key = _FILING_STATUS_KEY[filing_status]
    return brackets.get(fs_key)


# ==============================================
# Core Functions
# ==============================================


def resolve_state_for_year(
    year_state: str | None,
    scenario_state: str | None,
) -> str | None:
    """Resolve the effective state for a given year.

    Priority: year-level override > scenario default > None.
    """
    return year_state if year_state is not None else scenario_state


def calculate_state_tax(
    gross_income: float,
    state: str,
    filing_status: FilingStatus = FilingStatus.SINGLE,
    custom_rate: float | None = None,
) -> float:
    """Calculate state income tax using progressive brackets.

    For "custom" state, applies a flat rate to income above the federal
    standard deduction. Returns 0.0 for None or unknown states.
    """
    if not state or state == "none":
        return 0.0

    if state == "custom":
        if custom_rate is None or custom_rate <= 0:
            return 0.0
        deduction = _get_federal_deduction(filing_status)
        taxable = max(0.0, gross_income - deduction)
        return taxable * custom_rate

    brackets = _get_brackets(state, filing_status)
    if brackets is None:
        return 0.0

    deduction = _get_deduction(state, filing_status)
    taxable_income = max(0.0, gross_income - deduction)

    tax = 0.0
    for bracket in brackets:
        if taxable_income <= bracket["min"]:
            break
        taxable_in_bracket = min(taxable_income, bracket["max"]) - bracket["min"]
        tax += taxable_in_bracket * bracket["rate"]

    return tax


def get_state_marginal_rate(
    gross_income: float,
    state: str,
    filing_status: FilingStatus = FilingStatus.SINGLE,
    custom_rate: float | None = None,
) -> float:
    """Get the state marginal tax rate at a given gross income level."""
    if not state or state == "none":
        return 0.0

    if state == "custom":
        if custom_rate is None or custom_rate <= 0:
            return 0.0
        deduction = _get_federal_deduction(filing_status)
        return custom_rate if gross_income > deduction else 0.0

    brackets = _get_brackets(state, filing_status)
    if brackets is None:
        return 0.0

    deduction = _get_deduction(state, filing_status)
    taxable_income = max(0.0, gross_income - deduction)

    for bracket in brackets:
        if taxable_income >= bracket["min"] and taxable_income < bracket["max"]:
            return bracket["rate"]

    return brackets[-1]["rate"]


def vectorized_state_tax(
    gross_incomes: np.ndarray,
    state: str,
    filing_status: FilingStatus = FilingStatus.SINGLE,
    custom_rate: float | None = None,
) -> np.ndarray:
    """Calculate state income tax for an array of gross incomes.

    Vectorized equivalent of calculate_state_tax for numpy arrays.
    """
    if not state or state == "none":
        return np.zeros_like(gross_incomes)

    if state == "custom":
        if custom_rate is None or custom_rate <= 0:
            return np.zeros_like(gross_incomes)
        deduction = _get_federal_deduction(filing_status)
        taxable = np.maximum(0.0, gross_incomes - deduction)
        return taxable * custom_rate

    brackets = _get_brackets(state, filing_status)
    if brackets is None:
        return np.zeros_like(gross_incomes)

    deduction = _get_deduction(state, filing_status)
    taxable = np.maximum(0.0, gross_incomes - deduction)

    tax = np.zeros_like(taxable)
    for bracket in brackets:
        bracket_max = bracket["max"]
        if bracket_max == float("inf"):
            bracket_max = NUMERIC_INFINITY
        in_bracket = np.minimum(taxable, bracket_max) - bracket["min"]
        in_bracket = np.maximum(0.0, in_bracket)
        tax += in_bracket * bracket["rate"]

    return tax


def get_supported_states() -> list[dict]:
    """Return metadata for all states with income tax (for frontend dropdown).

    Returns a list of {code, name, top_rate, tax_type} sorted alphabetically by name.
    """
    states = _TAX_DATA.get("states", {})
    result = []
    for code, data in states.items():
        if not data.get("has_income_tax", False):
            continue
        brackets = data.get("brackets", {})
        # Get top rate from single brackets (last bracket's rate)
        single_brackets = brackets.get("single", [])
        top_rate = single_brackets[-1]["rate"] if single_brackets else 0.0
        result.append(
            {
                "code": code,
                "name": data["name"],
                "top_rate": top_rate,
                "tax_type": data.get("tax_type", "unknown"),
            }
        )
    result.sort(key=lambda s: s["name"])
    return result


def get_all_states() -> list[dict]:
    """Return metadata for ALL states including no-tax states (for frontend dropdown).

    Returns a list of {code, name, has_income_tax, top_rate, tax_type}
    sorted alphabetically by name.
    """
    states = _TAX_DATA.get("states", {})
    result = []
    for code, data in states.items():
        has_tax = data.get("has_income_tax", False)
        top_rate = 0.0
        tax_type = "none"
        if has_tax:
            brackets = data.get("brackets", {})
            single_brackets = brackets.get("single", [])
            top_rate = single_brackets[-1]["rate"] if single_brackets else 0.0
            tax_type = data.get("tax_type", "unknown")
        result.append(
            {
                "code": code,
                "name": data["name"],
                "has_income_tax": has_tax,
                "top_rate": top_rate,
                "tax_type": tax_type,
            }
        )
    result.sort(key=lambda s: s["name"])
    return result


def get_tax_data_metadata() -> dict:
    """Return metadata about the tax data (year, source, last updated)."""
    return _TAX_DATA.get("metadata", {})
