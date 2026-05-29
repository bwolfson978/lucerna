"""Medicare IRMAA (Income-Related Monthly Adjustment Amount) calculations.

IRMAA adds surcharges to Medicare Part B and Part D premiums when MAGI
exceeds income thresholds. Critically, IRMAA uses MAGI from 2 years prior
to the surcharge year (a Roth conversion in 2026 affects 2028 Medicare costs).

Source: 2024 Medicare IRMAA brackets (CMS). Thresholds adjust annually for
inflation; these values are used as the planning baseline.
"""

from __future__ import annotations

import numpy as np

from app.engine.types import FilingStatus

__all__ = [
    "IRMAA_TIERS",
    "MEDICARE_START_AGE",
    "IRMAA_LOOKBACK_YEARS",
    "calculate_irmaa",
    "irmaa_surcharge_loss",
    "vectorized_irmaa_surcharge_loss",
    "irmaa_tier_index",
]

MEDICARE_START_AGE = 65
IRMAA_LOOKBACK_YEARS = 2

# Annual IRMAA surcharge per PERSON for Part B (2024 values).
# Tier 0 = no surcharge (below first threshold).
# For MFJ the total household cost is 2x per-person (both spouses on Medicare).
IRMAA_TIERS: list[dict] = [
    {"tier": 0, "mfj_max": 206_000, "single_max": 103_000, "annual_per_person": 0.0},
    {"tier": 1, "mfj_max": 258_000, "single_max": 129_000, "annual_per_person": 1_678.0},
    {"tier": 2, "mfj_max": 322_000, "single_max": 161_000, "annual_per_person": 4_193.0},
    {"tier": 3, "mfj_max": 386_000, "single_max": 193_000, "annual_per_person": 6_708.0},
    {"tier": 4, "mfj_max": 750_000, "single_max": 500_000, "annual_per_person": 9_223.0},
    {
        "tier": 5,
        "mfj_max": float("inf"),
        "single_max": float("inf"),
        "annual_per_person": 10_063.0,
    },
]

_PERSONS = {FilingStatus.MFJ: 2, FilingStatus.SINGLE: 1}

# Pre-build sorted threshold arrays for fast vectorized lookup
_MFJ_THRESHOLDS = np.array([t["mfj_max"] for t in IRMAA_TIERS])
_SINGLE_THRESHOLDS = np.array([t["single_max"] for t in IRMAA_TIERS])
_PER_PERSON_COSTS = np.array([t["annual_per_person"] for t in IRMAA_TIERS])


def irmaa_tier_index(magi: float, filing_status: FilingStatus) -> int:
    """Return the 0-based IRMAA tier index for a given MAGI."""
    thresholds = _MFJ_THRESHOLDS if filing_status == FilingStatus.MFJ else _SINGLE_THRESHOLDS
    idx = int(np.searchsorted(thresholds, magi, side="left"))
    return min(idx, len(IRMAA_TIERS) - 1)


def calculate_irmaa(magi: float, filing_status: FilingStatus) -> float:
    """Annual IRMAA household surcharge for a given MAGI.

    Returns the total annual surcharge for the household (both spouses for MFJ,
    one person for SINGLE). Part B only.
    """
    idx = irmaa_tier_index(magi, filing_status)
    return IRMAA_TIERS[idx]["annual_per_person"] * _PERSONS[filing_status]


def irmaa_surcharge_loss(
    base_magi: float,
    conversion: float,
    filing_status: FilingStatus,
) -> float:
    """Marginal IRMAA cost of adding `conversion` on top of `base_magi`.

    Step-function: zero unless the conversion crosses an IRMAA tier boundary.
    """
    return calculate_irmaa(base_magi + conversion, filing_status) - calculate_irmaa(
        base_magi, filing_status
    )


def vectorized_irmaa_surcharge_loss(
    base_magi: float,
    conversions: np.ndarray,
    filing_status: FilingStatus,
) -> np.ndarray:
    """Vectorized marginal IRMAA cost for an array of conversion amounts.

    Used by the DP pre-computation loop. Returns an array of annual IRMAA
    surcharge costs, one per conversion amount.
    """
    thresholds = _MFJ_THRESHOLDS if filing_status == FilingStatus.MFJ else _SINGLE_THRESHOLDS
    persons = _PERSONS[filing_status]

    base_cost = IRMAA_TIERS[irmaa_tier_index(base_magi, filing_status)]["annual_per_person"]

    total_magi = base_magi + conversions
    tier_indices = np.searchsorted(thresholds, total_magi, side="left")
    tier_indices = np.clip(tier_indices, 0, len(IRMAA_TIERS) - 1)
    return (_PER_PERSON_COSTS[tier_indices] - base_cost) * persons
