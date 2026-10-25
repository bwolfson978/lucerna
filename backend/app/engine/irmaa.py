"""Medicare IRMAA (Income-Related Monthly Adjustment Amount) calculations.

IRMAA adds surcharges to Medicare Part B and Part D premiums when MAGI
exceeds income thresholds. Critically, IRMAA uses MAGI from 2 years prior
to the surcharge year (a Roth conversion in 2026 affects 2028 Medicare costs).

Source: 2026 Medicare IRMAA brackets (CMS). Thresholds adjust annually for
inflation; these values are used as the planning baseline.
"""

from __future__ import annotations

import numpy as np

from app.engine.types import FilingStatus

__all__ = [
    "IRMAA_TIERS",
    "lookback_threshold_scale",
    "MEDICARE_START_AGE",
    "IRMAA_LOOKBACK_YEARS",
    "calculate_irmaa",
    "irmaa_surcharge_loss",
    "vectorized_irmaa_surcharge_loss",
    "irmaa_tier_index",
]

MEDICARE_START_AGE = 65
IRMAA_LOOKBACK_YEARS = 2

# Annual IRMAA surcharge per PERSON for Part B + Part D (2026 values).
# Monthly Part B surcharge above the $202.90 standard premium plus the Part D
# surcharge, times 12. Tier 0 = no surcharge (below first threshold).
# For MFJ the total household cost is 2x per-person (both spouses on Medicare).
IRMAA_TIERS: list[dict] = [
    {"tier": 0, "mfj_max": 218_000, "single_max": 109_000, "annual_per_person": 0.0},
    # $81.20 + $14.50
    {"tier": 1, "mfj_max": 274_000, "single_max": 137_000, "annual_per_person": 1_148.40},
    # $202.90 + $37.50
    {"tier": 2, "mfj_max": 342_000, "single_max": 171_000, "annual_per_person": 2_884.80},
    # $324.60 + $60.40
    {"tier": 3, "mfj_max": 410_000, "single_max": 205_000, "annual_per_person": 4_620.00},
    # $446.30 + $83.30
    {"tier": 4, "mfj_max": 750_000, "single_max": 500_000, "annual_per_person": 6_355.20},
    # $487.00 + $91.00
    {
        "tier": 5,
        "mfj_max": float("inf"),
        "single_max": float("inf"),
        "annual_per_person": 6_936.00,
    },
]

_PERSONS = {FilingStatus.MFJ: 2, FilingStatus.SINGLE: 1}

# Pre-build sorted threshold arrays for fast vectorized lookup
_MFJ_THRESHOLDS = np.array([t["mfj_max"] for t in IRMAA_TIERS])
_SINGLE_THRESHOLDS = np.array([t["single_max"] for t in IRMAA_TIERS])
_PER_PERSON_COSTS = np.array([t["annual_per_person"] for t in IRMAA_TIERS])


def lookback_threshold_scale(inflation_rate: float) -> float:
    """IRMAA tiers in the surcharge year, relative to the MAGI year that sets them.

    Amounts are in today's dollars (see ``app.engine.inflation``). The tiers rise
    with inflation, and a year's MAGI is compared with the tiers two years later,
    so in that year's dollars they sit two years of inflation higher.
    """
    return (1 + inflation_rate) ** IRMAA_LOOKBACK_YEARS


# Every function takes ``threshold_scale`` (see ``lookback_threshold_scale``): the
# tiers are multiplied by it before MAGI is compared with them.


def irmaa_tier_index(magi: float, filing_status: FilingStatus, threshold_scale: float = 1.0) -> int:
    """Return the 0-based IRMAA tier index for a given MAGI."""
    thresholds = _MFJ_THRESHOLDS if filing_status == FilingStatus.MFJ else _SINGLE_THRESHOLDS
    idx = int(np.searchsorted(thresholds, magi / threshold_scale, side="left"))
    return min(idx, len(IRMAA_TIERS) - 1)


def calculate_irmaa(
    magi: float,
    filing_status: FilingStatus,
    threshold_scale: float = 1.0,
    persons: int | None = None,
) -> float:
    """Annual IRMAA household surcharge for a given MAGI.

    Returns the total annual surcharge for the ``persons`` on Medicare (default: both
    spouses for MFJ, one person for SINGLE). Part B and Part D.
    """
    idx = irmaa_tier_index(magi, filing_status, threshold_scale)
    return IRMAA_TIERS[idx]["annual_per_person"] * _persons(filing_status, persons)


def _persons(filing_status: FilingStatus, persons: int | None) -> int:
    return _PERSONS[filing_status] if persons is None else persons


def irmaa_surcharge_loss(
    base_magi: float,
    conversion: float,
    filing_status: FilingStatus,
    threshold_scale: float = 1.0,
    persons: int | None = None,
) -> float:
    """Marginal IRMAA cost of adding `conversion` on top of `base_magi`.

    Step-function: zero unless the conversion crosses an IRMAA tier boundary.
    """
    return calculate_irmaa(
        base_magi + conversion, filing_status, threshold_scale, persons
    ) - calculate_irmaa(base_magi, filing_status, threshold_scale, persons)


def vectorized_irmaa_surcharge_loss(
    base_magi: float,
    conversions: np.ndarray,
    filing_status: FilingStatus,
    threshold_scale: float = 1.0,
    persons: int | None = None,
) -> np.ndarray:
    """Vectorized marginal IRMAA cost for an array of conversion amounts.

    Used by the DP pre-computation loop. Returns an array of annual IRMAA
    surcharge costs, one per conversion amount.
    """
    thresholds = _MFJ_THRESHOLDS if filing_status == FilingStatus.MFJ else _SINGLE_THRESHOLDS
    thresholds = thresholds * threshold_scale
    persons = _persons(filing_status, persons)

    base_tier = irmaa_tier_index(base_magi, filing_status, threshold_scale)
    base_cost = IRMAA_TIERS[base_tier]["annual_per_person"]

    total_magi = base_magi + conversions
    tier_indices = np.searchsorted(thresholds, total_magi, side="left")
    tier_indices = np.clip(tier_indices, 0, len(IRMAA_TIERS) - 1)
    return (_PER_PERSON_COSTS[tier_indices] - base_cost) * persons
