"""Required Minimum Distribution (RMD) calculations.

Implements IRS rules for mandatory withdrawals from traditional IRAs
per SECURE 2.0 Act (2022) and the updated Uniform Lifetime Table
(effective 2022+).

RMD start ages (SECURE 2.0):
- Born 1950 or earlier: 72
- Born 1951–1959: 73
- Born 1960 or later: 75
"""

import numpy as np


# IRS Uniform Lifetime Table (updated 2022).
# Maps owner age → distribution period (divisor).
# RMD = account balance on Dec 31 of prior year / divisor.
UNIFORM_LIFETIME_TABLE: dict[int, float] = {
    72: 27.4,
    73: 26.5,
    74: 25.5,
    75: 24.6,
    76: 23.7,
    77: 22.9,
    78: 22.0,
    79: 21.1,
    80: 20.2,
    81: 19.4,
    82: 18.5,
    83: 17.7,
    84: 16.8,
    85: 16.0,
    86: 15.2,
    87: 14.4,
    88: 13.7,
    89: 12.9,
    90: 12.2,
    91: 11.5,
    92: 10.8,
    93: 10.1,
    94: 9.5,
    95: 8.9,
    96: 8.4,
    97: 7.8,
    98: 7.3,
    99: 6.8,
    100: 6.4,
    101: 6.0,
    102: 5.6,
    103: 5.2,
    104: 4.9,
    105: 4.6,
    106: 4.3,
    107: 4.1,
    108: 3.9,
    109: 3.7,
    110: 3.5,
    111: 3.4,
    112: 3.3,
    113: 3.1,
    114: 3.0,
    115: 2.9,
    116: 2.8,
    117: 2.7,
    118: 2.5,
    119: 2.3,
    120: 2.0,
}


def rmd_start_age(current_age: int, current_year: int = 2026) -> int:
    """Determine the RMD start age based on birth year per SECURE 2.0.

    Args:
        current_age: Owner's current age.
        current_year: Calendar year (for computing birth year).

    Returns:
        The age at which RMDs must begin.
    """
    birth_year = current_year - current_age
    if birth_year <= 1950:
        return 72
    elif birth_year <= 1959:
        return 73
    else:
        return 75


def get_distribution_period(age: int) -> float:
    """Look up the IRS Uniform Lifetime Table distribution period for a given age.

    For ages below 72, returns 0 (no RMD required).
    For ages above 120, uses the 120 value (2.0).
    """
    if age < 72:
        return 0.0
    if age > 120:
        return UNIFORM_LIFETIME_TABLE[120]
    return UNIFORM_LIFETIME_TABLE.get(age, 2.0)


def calculate_rmd(balance_start_of_year: float, owner_age: int) -> float:
    """Calculate the Required Minimum Distribution for a given year.

    Args:
        balance_start_of_year: Traditional IRA balance on Dec 31 of prior year
            (equivalently, start of the distribution year).
        owner_age: Owner's age in the distribution year.

    Returns:
        The minimum amount that must be withdrawn. Returns 0 if the owner
        has not yet reached RMD age (per the Uniform Lifetime Table).
    """
    period = get_distribution_period(owner_age)
    if period <= 0:
        return 0.0
    return balance_start_of_year / period


def vectorized_rmd(balances: np.ndarray, owner_age: int) -> np.ndarray:
    """Calculate RMD for an array of balances at a given age.

    Used by the DP optimizer for vectorized retirement phase computation.
    """
    period = get_distribution_period(owner_age)
    if period <= 0:
        return np.zeros_like(balances)
    return balances / period
