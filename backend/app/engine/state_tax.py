"""State income tax bracket data and calculation functions.

Static 2025 bracket data for the top 10 highest-tax US states.
Follows the same additive-cost-layer pattern as ACA subsidy integration —
state tax is computed independently and added to the federal tax cost
in the optimizer.

Source: State tax authority publications for tax year 2025.
Updated annually when new brackets are announced.
"""

import numpy as np
from typing import Optional

from app.engine.types import FilingStatus


# ==============================================
# State Standard Deductions (2025)
# States not listed here use the federal standard deduction as approximation.
# ==============================================

STATE_STANDARD_DEDUCTIONS: dict[str, dict[FilingStatus, float]] = {
    "CA": {
        FilingStatus.SINGLE: 5_540,
        FilingStatus.MFJ: 11_080,
    },
    "NY": {
        FilingStatus.SINGLE: 8_000,
        FilingStatus.MFJ: 16_050,
    },
    "NJ": {
        # NJ uses personal exemptions, not a standard deduction.
        FilingStatus.SINGLE: 1_000,
        FilingStatus.MFJ: 2_000,
    },
    "OR": {
        FilingStatus.SINGLE: 2_745,
        FilingStatus.MFJ: 5_495,
    },
    "MN": {
        FilingStatus.SINGLE: 14_575,
        FilingStatus.MFJ: 29_150,
    },
    "HI": {
        FilingStatus.SINGLE: 2_200,
        FilingStatus.MFJ: 4_400,
    },
    "CT": {
        FilingStatus.SINGLE: 15_000,
        FilingStatus.MFJ: 24_000,
    },
    "MA": {
        FilingStatus.SINGLE: 4_400,
        FilingStatus.MFJ: 8_800,
    },
    "WI": {
        FilingStatus.SINGLE: 13_230,
        FilingStatus.MFJ: 24_500,
    },
    "IA": {
        FilingStatus.SINGLE: 2_210,
        FilingStatus.MFJ: 5_450,
    },
}

FEDERAL_STANDARD_DEDUCTION = {
    FilingStatus.SINGLE: 15_000,
    FilingStatus.MFJ: 30_000,
}


# ==============================================
# 2025 State Tax Brackets
# Format: {min, max, rate} on taxable income (after deduction)
# ==============================================

STATE_BRACKETS: dict[str, dict[FilingStatus, list[dict]]] = {
    "CA": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 10_756, "rate": 0.01},
            {"min": 10_756, "max": 25_499, "rate": 0.02},
            {"min": 25_499, "max": 40_245, "rate": 0.04},
            {"min": 40_245, "max": 55_866, "rate": 0.06},
            {"min": 55_866, "max": 70_606, "rate": 0.08},
            {"min": 70_606, "max": 360_659, "rate": 0.093},
            {"min": 360_659, "max": 432_787, "rate": 0.103},
            {"min": 432_787, "max": 721_314, "rate": 0.113},
            {"min": 721_314, "max": 1_000_000, "rate": 0.123},
            {"min": 1_000_000, "max": float("inf"), "rate": 0.133},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 21_512, "rate": 0.01},
            {"min": 21_512, "max": 50_998, "rate": 0.02},
            {"min": 50_998, "max": 80_490, "rate": 0.04},
            {"min": 80_490, "max": 111_732, "rate": 0.06},
            {"min": 111_732, "max": 141_212, "rate": 0.08},
            {"min": 141_212, "max": 721_318, "rate": 0.093},
            {"min": 721_318, "max": 865_574, "rate": 0.103},
            {"min": 865_574, "max": 1_442_628, "rate": 0.113},
            {"min": 1_442_628, "max": 2_000_000, "rate": 0.123},
            {"min": 2_000_000, "max": float("inf"), "rate": 0.133},
        ],
    },
    "NY": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 8_500, "rate": 0.04},
            {"min": 8_500, "max": 11_700, "rate": 0.045},
            {"min": 11_700, "max": 13_900, "rate": 0.0525},
            {"min": 13_900, "max": 80_650, "rate": 0.0585},
            {"min": 80_650, "max": 215_400, "rate": 0.0625},
            {"min": 215_400, "max": 1_077_550, "rate": 0.0685},
            {"min": 1_077_550, "max": 5_000_000, "rate": 0.0965},
            {"min": 5_000_000, "max": 25_000_000, "rate": 0.103},
            {"min": 25_000_000, "max": float("inf"), "rate": 0.109},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 17_150, "rate": 0.04},
            {"min": 17_150, "max": 23_600, "rate": 0.045},
            {"min": 23_600, "max": 27_900, "rate": 0.0525},
            {"min": 27_900, "max": 161_550, "rate": 0.0585},
            {"min": 161_550, "max": 323_200, "rate": 0.0625},
            {"min": 323_200, "max": 2_155_350, "rate": 0.0685},
            {"min": 2_155_350, "max": 5_000_000, "rate": 0.0965},
            {"min": 5_000_000, "max": 25_000_000, "rate": 0.103},
            {"min": 25_000_000, "max": float("inf"), "rate": 0.109},
        ],
    },
    "NJ": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 20_000, "rate": 0.014},
            {"min": 20_000, "max": 35_000, "rate": 0.0175},
            {"min": 35_000, "max": 40_000, "rate": 0.035},
            {"min": 40_000, "max": 75_000, "rate": 0.05525},
            {"min": 75_000, "max": 500_000, "rate": 0.0637},
            {"min": 500_000, "max": 1_000_000, "rate": 0.0897},
            {"min": 1_000_000, "max": float("inf"), "rate": 0.1075},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 20_000, "rate": 0.014},
            {"min": 20_000, "max": 50_000, "rate": 0.0175},
            {"min": 50_000, "max": 70_000, "rate": 0.0245},
            {"min": 70_000, "max": 80_000, "rate": 0.035},
            {"min": 80_000, "max": 150_000, "rate": 0.05525},
            {"min": 150_000, "max": 500_000, "rate": 0.0637},
            {"min": 500_000, "max": 1_000_000, "rate": 0.0897},
            {"min": 1_000_000, "max": float("inf"), "rate": 0.1075},
        ],
    },
    "OR": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 4_300, "rate": 0.0475},
            {"min": 4_300, "max": 10_750, "rate": 0.0675},
            {"min": 10_750, "max": 125_000, "rate": 0.0875},
            {"min": 125_000, "max": float("inf"), "rate": 0.099},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 8_600, "rate": 0.0475},
            {"min": 8_600, "max": 21_500, "rate": 0.0675},
            {"min": 21_500, "max": 250_000, "rate": 0.0875},
            {"min": 250_000, "max": float("inf"), "rate": 0.099},
        ],
    },
    "MN": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 31_690, "rate": 0.0535},
            {"min": 31_690, "max": 104_090, "rate": 0.068},
            {"min": 104_090, "max": 193_240, "rate": 0.0785},
            {"min": 193_240, "max": float("inf"), "rate": 0.0985},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 46_330, "rate": 0.0535},
            {"min": 46_330, "max": 184_040, "rate": 0.068},
            {"min": 184_040, "max": 321_450, "rate": 0.0785},
            {"min": 321_450, "max": float("inf"), "rate": 0.0985},
        ],
    },
    "HI": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 2_400, "rate": 0.014},
            {"min": 2_400, "max": 4_800, "rate": 0.032},
            {"min": 4_800, "max": 9_600, "rate": 0.055},
            {"min": 9_600, "max": 14_400, "rate": 0.064},
            {"min": 14_400, "max": 19_200, "rate": 0.068},
            {"min": 19_200, "max": 24_000, "rate": 0.072},
            {"min": 24_000, "max": 36_000, "rate": 0.076},
            {"min": 36_000, "max": 48_000, "rate": 0.079},
            {"min": 48_000, "max": 150_000, "rate": 0.0825},
            {"min": 150_000, "max": 175_000, "rate": 0.09},
            {"min": 175_000, "max": 200_000, "rate": 0.10},
            {"min": 200_000, "max": float("inf"), "rate": 0.11},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 4_800, "rate": 0.014},
            {"min": 4_800, "max": 9_600, "rate": 0.032},
            {"min": 9_600, "max": 19_200, "rate": 0.055},
            {"min": 19_200, "max": 28_800, "rate": 0.064},
            {"min": 28_800, "max": 38_400, "rate": 0.068},
            {"min": 38_400, "max": 48_000, "rate": 0.072},
            {"min": 48_000, "max": 72_000, "rate": 0.076},
            {"min": 72_000, "max": 96_000, "rate": 0.079},
            {"min": 96_000, "max": 300_000, "rate": 0.0825},
            {"min": 300_000, "max": 350_000, "rate": 0.09},
            {"min": 350_000, "max": 400_000, "rate": 0.10},
            {"min": 400_000, "max": float("inf"), "rate": 0.11},
        ],
    },
    "CT": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 10_000, "rate": 0.03},
            {"min": 10_000, "max": 50_000, "rate": 0.05},
            {"min": 50_000, "max": 100_000, "rate": 0.055},
            {"min": 100_000, "max": 200_000, "rate": 0.06},
            {"min": 200_000, "max": 250_000, "rate": 0.065},
            {"min": 250_000, "max": 500_000, "rate": 0.069},
            {"min": 500_000, "max": float("inf"), "rate": 0.0699},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 20_000, "rate": 0.03},
            {"min": 20_000, "max": 100_000, "rate": 0.05},
            {"min": 100_000, "max": 200_000, "rate": 0.055},
            {"min": 200_000, "max": 400_000, "rate": 0.06},
            {"min": 400_000, "max": 500_000, "rate": 0.065},
            {"min": 500_000, "max": 1_000_000, "rate": 0.069},
            {"min": 1_000_000, "max": float("inf"), "rate": 0.0699},
        ],
    },
    "MA": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 1_000_000, "rate": 0.05},
            {"min": 1_000_000, "max": float("inf"), "rate": 0.09},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 1_000_000, "rate": 0.05},
            {"min": 1_000_000, "max": float("inf"), "rate": 0.09},
        ],
    },
    "WI": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 14_320, "rate": 0.035},
            {"min": 14_320, "max": 28_640, "rate": 0.044},
            {"min": 28_640, "max": 315_310, "rate": 0.053},
            {"min": 315_310, "max": float("inf"), "rate": 0.0765},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 19_090, "rate": 0.035},
            {"min": 19_090, "max": 38_190, "rate": 0.044},
            {"min": 38_190, "max": 420_420, "rate": 0.053},
            {"min": 420_420, "max": float("inf"), "rate": 0.0765},
        ],
    },
    "IA": {
        FilingStatus.SINGLE: [
            {"min": 0, "max": 6_210, "rate": 0.044},
            {"min": 6_210, "max": 31_050, "rate": 0.0482},
            {"min": 31_050, "max": 62_100, "rate": 0.057},
            {"min": 62_100, "max": float("inf"), "rate": 0.057},
        ],
        FilingStatus.MFJ: [
            {"min": 0, "max": 12_420, "rate": 0.044},
            {"min": 12_420, "max": 62_100, "rate": 0.0482},
            {"min": 62_100, "max": 124_200, "rate": 0.057},
            {"min": 124_200, "max": float("inf"), "rate": 0.057},
        ],
    },
}


SUPPORTED_STATES: list[dict] = [
    {"code": "CA", "name": "California", "top_rate": 0.133},
    {"code": "CT", "name": "Connecticut", "top_rate": 0.0699},
    {"code": "HI", "name": "Hawaii", "top_rate": 0.11},
    {"code": "IA", "name": "Iowa", "top_rate": 0.057},
    {"code": "MA", "name": "Massachusetts", "top_rate": 0.09},
    {"code": "MN", "name": "Minnesota", "top_rate": 0.0985},
    {"code": "NJ", "name": "New Jersey", "top_rate": 0.1075},
    {"code": "NY", "name": "New York", "top_rate": 0.109},
    {"code": "OR", "name": "Oregon", "top_rate": 0.099},
    {"code": "WI", "name": "Wisconsin", "top_rate": 0.0765},
]


# ==============================================
# Core Functions
# ==============================================


def resolve_state_for_year(
    year_state: Optional[str],
    scenario_state: Optional[str],
) -> Optional[str]:
    """Resolve the effective state for a given year.

    Priority: year-level override > scenario default > None.
    """
    return year_state if year_state is not None else scenario_state


def _get_deduction(state: str, filing_status: FilingStatus) -> float:
    """Get the standard deduction for a state, falling back to federal."""
    if state in STATE_STANDARD_DEDUCTIONS:
        return STATE_STANDARD_DEDUCTIONS[state][filing_status]
    return FEDERAL_STANDARD_DEDUCTION[filing_status]


def calculate_state_tax(
    gross_income: float,
    state: str,
    filing_status: FilingStatus = FilingStatus.SINGLE,
    custom_rate: Optional[float] = None,
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
        deduction = FEDERAL_STANDARD_DEDUCTION[filing_status]
        taxable = max(0.0, gross_income - deduction)
        return taxable * custom_rate

    if state not in STATE_BRACKETS:
        return 0.0

    deduction = _get_deduction(state, filing_status)
    taxable_income = max(0.0, gross_income - deduction)
    brackets = STATE_BRACKETS[state][filing_status]

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
    custom_rate: Optional[float] = None,
) -> float:
    """Get the state marginal tax rate at a given gross income level."""
    if not state or state == "none":
        return 0.0

    if state == "custom":
        if custom_rate is None or custom_rate <= 0:
            return 0.0
        deduction = FEDERAL_STANDARD_DEDUCTION[filing_status]
        return custom_rate if gross_income > deduction else 0.0

    if state not in STATE_BRACKETS:
        return 0.0

    deduction = _get_deduction(state, filing_status)
    taxable_income = max(0.0, gross_income - deduction)
    brackets = STATE_BRACKETS[state][filing_status]

    for bracket in brackets:
        if taxable_income >= bracket["min"] and taxable_income < bracket["max"]:
            return bracket["rate"]

    return brackets[-1]["rate"]


def vectorized_state_tax(
    gross_incomes: np.ndarray,
    state: str,
    filing_status: FilingStatus = FilingStatus.SINGLE,
    custom_rate: Optional[float] = None,
) -> np.ndarray:
    """Calculate state income tax for an array of gross incomes.

    Vectorized equivalent of calculate_state_tax for numpy arrays.
    """
    if not state or state == "none":
        return np.zeros_like(gross_incomes)

    if state == "custom":
        if custom_rate is None or custom_rate <= 0:
            return np.zeros_like(gross_incomes)
        deduction = FEDERAL_STANDARD_DEDUCTION[filing_status]
        taxable = np.maximum(0.0, gross_incomes - deduction)
        return taxable * custom_rate

    if state not in STATE_BRACKETS:
        return np.zeros_like(gross_incomes)

    deduction = _get_deduction(state, filing_status)
    taxable = np.maximum(0.0, gross_incomes - deduction)
    brackets = STATE_BRACKETS[state][filing_status]

    tax = np.zeros_like(taxable)
    for bracket in brackets:
        bracket_max = bracket["max"]
        if bracket_max == float("inf"):
            bracket_max = 1e18
        in_bracket = np.minimum(taxable, bracket_max) - bracket["min"]
        in_bracket = np.maximum(0.0, in_bracket)
        tax += in_bracket * bracket["rate"]

    return tax


def get_supported_states() -> list[dict]:
    """Return metadata for supported states (for frontend dropdown)."""
    return SUPPORTED_STATES
