"""Shared constants for the optimization engine.

Centralizes magic numbers and configuration values that were previously
scattered across multiple modules.
"""

__all__ = [
    "ROUNDING_RESOLUTION",
    "RETIREMENT_SPENDING_RATE",
    "DISPLAY_BRACKET_CAP",
    "NUMERIC_INFINITY",
    "IMPROVEMENT_THRESHOLD",
    "LARGE_BALANCE_THRESHOLD",
    "LARGE_INCOME_VARIATION",
    "HIGH_GROWTH_RATE",
    "LOW_GROWTH_RATE",
    "LONG_RETIREMENT_YEARS",
    "BRACKET_FULL_THRESHOLD",
    "round_to_resolution",
]

# Conversion rounding — all final conversion amounts are rounded to this
# resolution for clean display and to avoid false precision.
ROUNDING_RESOLUTION = 100  # dollars

# Default retirement spending as a fraction of total retirement balance
# (the "4% rule").
RETIREMENT_SPENDING_RATE = 0.04

# Display cap for the infinite top tax bracket in visualizations.
# Used in bracket fill analysis and chart rendering.
DISPLAY_BRACKET_CAP = 500_000  # dollars above bracket min

# Large finite number used as a stand-in for infinity in numpy operations
# (np.inf causes issues with some vectorized comparisons).
NUMERIC_INFINITY = 1e18

# Early-stopping threshold for scipy multi-restart optimization.
# If a subsequent restart improves NPV by less than this fraction, stop.
IMPROVEMENT_THRESHOLD = 0.001  # 0.1%

# Sensitivity thresholds used in the reasoning trace.
LARGE_BALANCE_THRESHOLD = 500_000  # dollars
LARGE_INCOME_VARIATION = 50_000  # dollars
HIGH_GROWTH_RATE = 0.08
LOW_GROWTH_RATE = 0.05
LONG_RETIREMENT_YEARS = 30

# Bracket fill analysis: consider a bracket "fully filled" when remaining
# capacity is below this threshold.
BRACKET_FULL_THRESHOLD = 100  # dollars


def round_to_resolution(amount: float) -> float:
    """Round a dollar amount to the nearest ROUNDING_RESOLUTION."""
    return round(amount / ROUNDING_RESOLUTION) * ROUNDING_RESOLUTION
