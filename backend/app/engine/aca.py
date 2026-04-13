"""ACA Premium Tax Credit calculator.

Models the interaction between Roth conversions and ACA marketplace subsidies.
Roth conversions increase MAGI, which can reduce or eliminate the premium tax
credit — making the "true cost" of a conversion higher than just the federal
tax. This module calculates that hidden cost.

Uses 2026 rules (post-cliff reversion to original ACA percentages) with
2025 Federal Poverty Level guidelines per IRS Rev. Proc. 2025-25.
"""

import numpy as np

from app.engine.types import FilingStatus

__all__ = [
    "federal_poverty_level",
    "calculate_aca_subsidy",
    "calculate_subsidy_loss",
    "vectorized_subsidy_loss",
    "find_subsidy_cliff_income",
    "calculate_combined_marginal_rate",
]

# =====================================================================
# 2025 Federal Poverty Level Guidelines (used for 2026 ACA coverage)
# Source: HHS/ASPE 2025 Poverty Guidelines
# =====================================================================

FPL_BASE = 15650  # Household size 1
FPL_INCREMENT = 5500  # Per additional household member


def federal_poverty_level(household_size: int) -> float:
    """Return the 100% FPL for a given household size (48 contiguous states)."""
    return FPL_BASE + FPL_INCREMENT * max(0, household_size - 1)


# =====================================================================
# 2026 Applicable Percentage Table (ACA-only rules, cliff at 400% FPL)
# Source: IRS Rev. Proc. 2025-25
#
# Each tier specifies (fpl_min%, fpl_max%, pct_initial, pct_final).
# Within a tier, the applicable percentage interpolates linearly.
# =====================================================================

APPLICABLE_PCT_TABLE = [
    (100, 150, 0.0210, 0.0419),
    (150, 200, 0.0419, 0.0663),
    (200, 250, 0.0663, 0.0837),
    (250, 300, 0.0837, 0.0996),
    (300, 400, 0.0996, 0.0996),
]


def _applicable_percentage(income_as_pct_fpl: float) -> float | None:
    """Return the applicable contribution percentage for a given FPL%.

    Returns None if the household is above 400% FPL (no subsidy) or
    below 100% FPL (Medicaid range, not eligible for PTC).
    """
    if income_as_pct_fpl < 100 or income_as_pct_fpl > 400:
        return None

    for fpl_min, fpl_max, pct_start, pct_end in APPLICABLE_PCT_TABLE:
        if income_as_pct_fpl <= fpl_max:
            # Linear interpolation within the tier
            tier_span = fpl_max - fpl_min
            position = (income_as_pct_fpl - fpl_min) / tier_span
            return pct_start + position * (pct_end - pct_start)

    return None


def calculate_aca_subsidy(
    magi: float,
    household_size: int,
    monthly_slcsp_premium: float,
) -> float:
    """Calculate the annual ACA premium tax credit (subsidy).

    Args:
        magi: Modified Adjusted Gross Income. For Roth conversion purposes,
              this is gross_income + conversion_amount.
        household_size: Number of people in the tax household.
        monthly_slcsp_premium: Monthly premium for the Second Lowest Cost
                               Silver Plan in the user's area. Users can
                               find this on healthcare.gov or their 1095-A.

    Returns:
        Annual premium tax credit (subsidy). Zero if income is above 400% FPL
        or below 100% FPL, or if the expected contribution exceeds the premium.
    """
    fpl = federal_poverty_level(household_size)
    income_pct_fpl = (magi / fpl) * 100

    applicable_pct = _applicable_percentage(income_pct_fpl)
    if applicable_pct is None:
        return 0.0

    annual_slcsp = monthly_slcsp_premium * 12
    expected_contribution = magi * applicable_pct
    subsidy = max(0.0, annual_slcsp - expected_contribution)

    return subsidy


def calculate_subsidy_loss(
    base_income: float,
    conversion_amount: float,
    household_size: int,
    monthly_slcsp_premium: float,
) -> float:
    """Calculate how much ACA subsidy is lost due to a Roth conversion.

    This is the "hidden cost" of the conversion — the amount by which
    the premium tax credit decreases when MAGI increases by the
    conversion amount.

    Returns:
        The dollar amount of annual subsidy lost (>= 0).
    """
    subsidy_without = calculate_aca_subsidy(
        base_income,
        household_size,
        monthly_slcsp_premium,
    )
    subsidy_with = calculate_aca_subsidy(
        base_income + conversion_amount,
        household_size,
        monthly_slcsp_premium,
    )
    return max(0.0, subsidy_without - subsidy_with)


def vectorized_subsidy_loss(
    base_income: float,
    conversion_amounts: np.ndarray,
    household_size: int,
    monthly_slcsp_premium: float,
) -> np.ndarray:
    """Vectorized version of calculate_subsidy_loss for numpy arrays.

    Computes subsidy loss for a single base_income across many conversion
    amounts simultaneously.
    """
    fpl = federal_poverty_level(household_size)
    annual_slcsp = monthly_slcsp_premium * 12

    # Subsidy without conversion (scalar)
    pct_fpl_without = (base_income / fpl) * 100
    sub_without = _vectorized_subsidy_at_pct_fpl(pct_fpl_without, base_income, annual_slcsp)

    # Subsidy with conversion (vectorized)
    magis = base_income + conversion_amounts
    pct_fpls = (magis / fpl) * 100
    subs_with = np.zeros_like(conversion_amounts, dtype=float)

    for fpl_min, fpl_max, pct_start, pct_end in APPLICABLE_PCT_TABLE:
        mask = (pct_fpls >= fpl_min) & (pct_fpls <= fpl_max)
        if not np.any(mask):
            continue
        tier_span = fpl_max - fpl_min
        position = (pct_fpls[mask] - fpl_min) / tier_span
        applicable_pct = pct_start + position * (pct_end - pct_start)
        expected_contribution = magis[mask] * applicable_pct
        subs_with[mask] = np.maximum(0.0, annual_slcsp - expected_contribution)

    # Also need to handle the 100-400% FPL range (outside = 0 subsidy, already 0)
    # Mask for valid range
    valid = (pct_fpls >= 100) & (pct_fpls <= 400)
    subs_with = np.where(valid, subs_with, 0.0)

    return np.maximum(0.0, sub_without - subs_with)


def _vectorized_subsidy_at_pct_fpl(
    pct_fpl: float,
    magi: float,
    annual_slcsp: float,
) -> float:
    """Helper: compute scalar subsidy for a single income."""
    if pct_fpl < 100 or pct_fpl > 400:
        return 0.0
    applicable_pct = _applicable_percentage(pct_fpl)
    if applicable_pct is None:
        return 0.0
    return max(0.0, annual_slcsp - magi * applicable_pct)


def find_subsidy_cliff_income(
    household_size: int,
) -> float:
    """Return the income at which ACA subsidies drop to zero (400% FPL)."""
    return federal_poverty_level(household_size) * 4.0


def calculate_combined_marginal_rate(
    base_income: float,
    conversion_amount: float,
    household_size: int,
    monthly_slcsp_premium: float,
    filing_status: FilingStatus,
) -> float:
    """Calculate the combined marginal rate including federal tax + ACA subsidy loss.

    This is the ACA-specific "true cost" as a percentage of the conversion
    amount: (federal_tax + subsidy_loss) / conversion_amount.

    Note: This differs from ``tax_cost.combined_marginal_rate`` which computes
    federal + state marginal rates (without ACA). Use this function when you
    need the ACA-aware cost; use ``tax_cost.combined_marginal_rate`` when you
    need the federal + state marginal rate.
    """
    if conversion_amount <= 0:
        return 0.0

    from app.engine.tax_cost import federal_tax_on_conversion

    fed_cost = federal_tax_on_conversion(base_income, conversion_amount, filing_status)

    subsidy_loss = calculate_subsidy_loss(
        base_income,
        conversion_amount,
        household_size,
        monthly_slcsp_premium,
    )

    return (fed_cost + subsidy_loss) / conversion_amount
