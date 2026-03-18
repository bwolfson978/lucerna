from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class FilingStatus(str, Enum):
    SINGLE = "single"
    MFJ = "married_filing_jointly"


class LifeEvent(str, Enum):
    NONE = "none"
    GRAD_SCHOOL = "grad_school"
    SABBATICAL = "sabbatical"
    STARTUP = "startup"
    CAREER_CHANGE = "career_change"
    PART_TIME = "part_time"
    EARLY_RETIREMENT = "early_retirement"
    PARENTAL_LEAVE = "parental_leave"
    BACK_TO_WORK = "back_to_work"
    LAYOFF = "layoff"


class YearlyIncome(BaseModel):
    """Income forecast for a single year in the trajectory."""
    year: int
    gross_income: float = Field(ge=0)
    life_event: LifeEvent = LifeEvent.NONE


class ConversionPreferences(BaseModel):
    """Optional user constraints on the conversion schedule."""
    max_annual_tax_cost: Optional[float] = Field(
        default=None, ge=0,
        description="Maximum tax the user can pay per year on conversions"
    )
    min_conversion_years: Optional[int] = Field(
        default=None, ge=1, le=15,
        description="Minimum number of years to spread conversions across"
    )
    max_conversion_per_year: Optional[float] = Field(
        default=None, ge=0,
        description="Maximum conversion amount in any single year"
    )


class ScenarioInput(BaseModel):
    """All inputs needed to run the multi-year optimization."""

    # Personal
    age: int = Field(ge=18, le=80, description="Current age")
    filing_status: FilingStatus

    # Income trajectory (the core input — replaces single-year income)
    income_trajectory: list[YearlyIncome] = Field(
        min_length=1, max_length=15,
        description="Year-by-year income forecast. The optimizer finds the best conversion schedule across all years."
    )

    # Retirement accounts
    traditional_ira_balance: float = Field(ge=0, description="Traditional IRA + rollover 401k balance")
    roth_ira_balance: float = Field(default=0, ge=0, description="Existing Roth IRA balance")

    # Retirement assumptions (with defaults)
    retirement_age: int = Field(default=65, ge=30, le=80)
    years_in_retirement: int = Field(default=25, ge=5, le=40)
    annual_retirement_spending: Optional[float] = Field(
        default=None,
        description="If not provided, defaults to 4% rule on total balance"
    )

    # Growth/discount rates (with defaults)
    annual_growth_rate: float = Field(default=0.07, ge=0.0, le=0.20)
    discount_rate: float = Field(default=0.05, ge=0.0, le=0.15)

    # Conversion preferences (optional constraints)
    conversion_preferences: Optional[ConversionPreferences] = None


class BracketFillResult(BaseModel):
    """How a single tax bracket is filled by income and conversion."""
    bracket_rate: float
    bracket_min: float
    bracket_max: float
    bracket_capacity: float
    filled_by_income: float
    filled_by_conversion: float
    remaining_capacity: float
    tax_in_bracket: float


class ScenarioComparison(BaseModel):
    """A single scenario for comparison (no conversion, optimal, full, etc.)."""
    label: str
    conversion_amount: float
    npv: float
    tax_on_conversion: float
    difference_from_optimal: float


class ReasoningTrace(BaseModel):
    """Structured explanation of WHY the optimal amount is what it is.
    This feeds the AI explanation layer."""

    binding_constraint: str
    marginal_tax_rate_at_optimal: float
    marginal_benefit_at_optimal: float

    cost_of_next_bracket: dict  # bracketRate, additionalTax, netEffect
    benefit_of_current_bracket: dict  # bracketRate, taxPaid, futureTaxAvoided

    sensitivity_notes: list[str]

    summary_points: dict  # whatToConvert, whyThisAmount, howMuchYouSave, keyTradeoff


class NPVCurvePoint(BaseModel):
    conversion_amount: float
    npv: float


class OptimizationResult(BaseModel):
    """Complete output from the multi-year optimizer."""

    # The answer: conversion amount per year
    yearly_conversions: list[float]  # One amount per year in trajectory
    total_conversion: float

    # Key metrics
    total_tax_on_conversions: float
    overall_effective_rate: float
    estimated_lifetime_tax_savings: float  # vs. no conversion
    npv_at_optimal: float
    npv_at_zero: float

    # Per-year detail
    yearly_detail: list[dict]  # Per year: {income, conversion, tax_cost, effective_rate, marginal_bracket}

    # Bracket visualization data (per year)
    yearly_bracket_fill: list[list[BracketFillResult]]

    # Scenario comparisons
    scenarios: list[ScenarioComparison]

    # AI explanation data
    reasoning_trace: ReasoningTrace

    # Balance projections
    traditional_at_retirement: float
    roth_at_retirement: float

    # Income trajectory chart data (income + conversion stacked bars with bracket lines)
    trajectory_chart: list[dict]  # Per year: {year, income, conversion, bracket_boundaries}

    # Unconstrained comparison (populated when conversion_preferences are active)
    unconstrained_npv: Optional[float] = None
    unconstrained_conversions: Optional[list[float]] = None

    # Input echo
    input: ScenarioInput
