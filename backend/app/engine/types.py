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
    state: Optional[str] = Field(
        default=None,
        description="State override for this year. None = use scenario default."
    )


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
    max_conversion_total: Optional[float] = Field(
        default=None, ge=0,
        description="Maximum total conversion across all years"
    )


class HealthcareInput(BaseModel):
    """ACA marketplace healthcare inputs for subsidy-aware optimization.

    Most users know their household size. The SLCSP premium can be looked
    up on healthcare.gov — we provide a reasonable default (~$620/month
    for a single 40-year-old, 2026 national average estimate) so users
    can get started immediately and refine later.
    """
    household_size: int = Field(
        default=1, ge=1,
        description="Number of people in the tax household"
    )
    monthly_slcsp_premium: float = Field(
        default=620.0, ge=0,
        description=(
            "Monthly premium for the Second Lowest Cost Silver Plan. "
            "Look this up on healthcare.gov or your 1095-A form."
        )
    )
    aca_coverage_years: Optional[list[int]] = Field(
        default=None,
        description=(
            "Calendar years when ACA marketplace coverage is needed. "
            "If not provided, defaults to all years in the income trajectory "
            "where income is below the employer-coverage threshold."
        )
    )
    has_employer_coverage_after: Optional[int] = Field(
        default=None,
        description=(
            "Calendar year when employer coverage resumes. ACA subsidy "
            "impact is only modeled for years before this. If not provided, "
            "ACA impact is modeled for all trajectory years."
        )
    )


class ScenarioInput(BaseModel):
    """All inputs needed to run the multi-year optimization."""

    # Personal
    age: int = Field(ge=0, le=120, description="Current age")
    filing_status: FilingStatus

    # Income trajectory (the core input — replaces single-year income)
    income_trajectory: list[YearlyIncome] = Field(
        min_length=1,
        description="Year-by-year income forecast. The optimizer finds the best conversion schedule across all years."
    )

    # Retirement accounts
    traditional_ira_balance: float = Field(ge=0, description="Traditional IRA + rollover 401k balance")
    roth_ira_balance: float = Field(default=0, ge=0, description="Existing Roth IRA balance")

    # Retirement assumptions (with defaults)
    retirement_age: int = Field(default=65, ge=1, le=120)
    years_in_retirement: int = Field(default=25, ge=1)
    annual_retirement_spending: Optional[float] = Field(
        default=None,
        description="If not provided, defaults to 4% rule on total balance"
    )

    # Growth/discount rates (with defaults)
    annual_growth_rate: float = Field(default=0.07)
    discount_rate: float = Field(default=0.05)

    # Conversion preferences (optional constraints)
    conversion_preferences: Optional[ConversionPreferences] = None

    # Healthcare / ACA subsidy inputs (optional — enables subsidy-aware optimization)
    healthcare: Optional[HealthcareInput] = None

    # State tax inputs (optional — enables state tax modeling)
    state: Optional[str] = Field(
        default=None,
        description="Default state of residence for working years. None = federal only."
    )
    retirement_state: Optional[str] = Field(
        default=None,
        description="State of residence in retirement. Defaults to `state` if not set."
    )
    custom_state_rate: Optional[float] = Field(
        default=None, ge=0, le=0.20,
        description="Custom flat state tax rate (used when state='custom')"
    )


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
    estimated_savings: float = 0.0
    yearly_conversions: list[float] = Field(default_factory=list)
    years: list[int] = Field(default_factory=list)


class AcaSubsidyDetail(BaseModel):
    """Per-year ACA subsidy impact for a given conversion schedule."""
    year: int
    magi_without_conversion: float
    magi_with_conversion: float
    subsidy_without_conversion: float
    subsidy_with_conversion: float
    subsidy_lost: float
    federal_tax_cost: float
    combined_cost: float
    combined_marginal_rate: float
    income_pct_fpl: float
    hits_cliff: bool


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

    # ACA subsidy impact (populated when healthcare inputs are provided)
    aca_impact: Optional[list[AcaSubsidyDetail]] = None
    aca_summary: Optional[dict] = None


class NPVCurvePoint(BaseModel):
    conversion_amount: float
    npv: float


class ConversionCurvePoint(BaseModel):
    """Pre-computed optimizer result at a specific total conversion cap.
    Powers the interactive slider on the frontend."""
    total_cap: float
    yearly_conversions: list[float]
    yearly_bracket_fill: list[list[BracketFillResult]]
    yearly_detail: list[dict]
    total_tax: float
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

    # Pre-computed conversion curve for interactive slider
    conversion_curve: list["ConversionCurvePoint"] = Field(default_factory=list)

    # Unconstrained comparison (populated when conversion_preferences are active)
    unconstrained_npv: Optional[float] = None
    unconstrained_conversions: Optional[list[float]] = None

    # ACA subsidy impact (populated when healthcare inputs are provided)
    aca_subsidy_impact: Optional[list[AcaSubsidyDetail]] = None
    total_subsidy_lost: Optional[float] = None
    subsidy_cliff_income: Optional[float] = None
    npv_without_aca: Optional[float] = None  # NPV from tax-only optimization for comparison

    # Input echo
    input: ScenarioInput
