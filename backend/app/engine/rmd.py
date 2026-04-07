"""Required Minimum Distribution (RMD) calculations.

Loads RMD data from the static JSON configuration file
(backend/data/rmd_tables.json). The JSON is the single source of
truth for the IRS Uniform Lifetime Table and SECURE 2.0 start age rules.

Source: IRS Publication 590-B, Table III (updated 2022)
        SECURE 2.0 Act of 2022, Section 107
"""

import json
from pathlib import Path

import numpy as np


# ==============================================
# Load RMD data from JSON at module init
# ==============================================

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_rmd_data() -> tuple[dict[int, float], int, list[dict]]:
    """Load RMD tables from the JSON configuration file.

    Returns:
        (uniform_lifetime_table, min_age, start_age_rules)
    """
    data_file = _DATA_DIR / "rmd_tables.json"
    with open(data_file, "r") as f:
        data = json.load(f)

    ult = data["uniform_lifetime_table"]
    table = {int(age): divisor for age, divisor in ult["entries"].items()}
    min_age = ult["min_age"]

    rules = data["start_age_rules"]["rules"]

    return table, min_age, rules


UNIFORM_LIFETIME_TABLE, _MIN_RMD_AGE, _START_AGE_RULES = _load_rmd_data()


def rmd_start_age(current_age: int, current_year: int = 2026) -> int:
    """Determine the RMD start age based on birth year per SECURE 2.0.

    Args:
        current_age: Owner's current age.
        current_year: Calendar year (for computing birth year).

    Returns:
        The age at which RMDs must begin.
    """
    birth_year = current_year - current_age
    for rule in _START_AGE_RULES:
        threshold = rule["born_on_or_before"]
        if threshold is None or birth_year <= threshold:
            return rule["rmd_start_age"]
    # Fallback (shouldn't reach here with a well-formed rules list)
    return _START_AGE_RULES[-1]["rmd_start_age"]


def get_distribution_period(age: int) -> float:
    """Look up the IRS Uniform Lifetime Table distribution period for a given age.

    For ages below the minimum RMD age, returns 0 (no RMD required).
    For ages above the table maximum, uses the last table value.
    """
    if age < _MIN_RMD_AGE:
        return 0.0
    max_age = max(UNIFORM_LIFETIME_TABLE)
    if age > max_age:
        return UNIFORM_LIFETIME_TABLE[max_age]
    return UNIFORM_LIFETIME_TABLE.get(age, UNIFORM_LIFETIME_TABLE[max_age])


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
