from enum import StrEnum

from pydantic import BaseModel, Field


class FilingStatus(StrEnum):
    SINGLE = "single"
    MFJ = "married_filing_jointly"


class PlanYear(BaseModel):
    """A single year in the planning timeline."""

    year: int
    gross_income: float = Field(ge=0)
    drawdown: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Draw this amount from accounts this year. "
            "None = externally funded (no engine drawdown)."
        ),
    )
    notes: str = Field(default="", description="Optional user notes for this year")
    state: str | None = Field(
        default=None, description="State override for this year. None = use scenario default."
    )


# Backward-compat alias — remove once all callers are updated
YearlyIncome = PlanYear


class ConversionPreferences(BaseModel):
    """Optional user constraints on the conversion schedule."""

    max_annual_tax_cost: float | None = Field(
        default=None, ge=0, description="Maximum tax the user can pay per year on conversions"
    )
    min_conversion_years: int | None = Field(
        default=None,
        ge=1,
        le=15,
        description="Minimum number of years to spread conversions across",
    )
    max_conversion_per_year: float | None = Field(
        default=None, ge=0, description="Maximum conversion amount in any single year"
    )
    max_conversion_total: float | None = Field(
        default=None, ge=0, description="Maximum total conversion across all years"
    )


class HealthcareInput(BaseModel):
    """ACA marketplace healthcare inputs for subsidy-aware optimization.

    Most users know their household size. The SLCSP premium can be looked
    up on healthcare.gov — we provide a reasonable default (~$620/month
    for a single 40-year-old, 2026 national average estimate) so users
    can get started immediately and refine later.
    """

    household_size: int = Field(
        default=1, ge=1, description="Number of people in the tax household"
    )
    monthly_slcsp_premium: float = Field(
        default=620.0,
        ge=0,
        description=(
            "Monthly premium for the Second Lowest Cost Silver Plan. "
            "Look this up on healthcare.gov or your 1095-A form."
        ),
    )
    aca_coverage_years: list[int] | None = Field(
        default=None,
        description=(
            "Calendar years when ACA marketplace coverage is needed. "
            "If not provided, defaults to all years in the income timeline "
            "where income is below the employer-coverage threshold."
        ),
    )
    has_employer_coverage_after: int | None = Field(
        default=None,
        description=(
            "Calendar year when employer coverage resumes. ACA subsidy "
            "impact is only modeled for years before this. If not provided, "
            "ACA impact is modeled for all timeline years."
        ),
    )


class ScenarioInput(BaseModel):
    """All inputs needed to run the multi-year optimization."""

    # Personal
    age: int = Field(ge=0, le=120, description="Current age")
    filing_status: FilingStatus

    # Planning timeline (replaces income_timeline)
    timeline: list[PlanYear] = Field(
        min_length=1,
        description=(
            "Year-by-year plan. gross_income sets the marginal tax base for conversion cost. "
            "drawdown (if set) funds spending from accounts this year. "
            "The optimizer finds the best conversion schedule across all years."
        ),
    )

    # Retirement accounts
    traditional_ira_balance: float = Field(
        ge=0, description="Traditional IRA + rollover 401k balance"
    )
    roth_ira_balance: float = Field(default=0, ge=0, description="Existing Roth IRA balance")

    # Drawdown parameters (with defaults)
    drawdown_start_age: int = Field(
        default=65,
        ge=1,
        le=120,
        description="Age when account distributions begin (post-timeline fallback)",
    )
    default_drawdown: float | None = Field(
        default=None,
        ge=0,
        description="Annual drawdown from accounts in post-timeline fallback. Defaults to 4% rule.",
    )
    planning_horizon_age: int = Field(
        default=90,
        ge=50,
        le=120,
        description="Age at end of plan (terminal liquidation year).",
    )

    # Growth/discount rates (with defaults)
    annual_growth_rate: float = Field(default=0.07)
    discount_rate: float = Field(default=0.05)

    # Conversion preferences (optional constraints)
    conversion_preferences: ConversionPreferences | None = None

    # Healthcare / ACA subsidy inputs (optional — enables subsidy-aware optimization)
    healthcare: HealthcareInput | None = None

    # State tax inputs (optional — enables state tax modeling)
    state: str | None = Field(
        default=None,
        description="Default state of residence for working years. None = federal only.",
    )
    retirement_state: str | None = Field(
        default=None,
        description="State of residence in retirement. Defaults to `state` if not set.",
    )
    custom_state_rate: float | None = Field(
        default=None,
        ge=0,
        le=0.20,
        description="Custom flat state tax rate (used when state='custom')",
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


class IrmaaYearDetail(BaseModel):
    """Per-year IRMAA surcharge detail for a given conversion schedule."""

    conversion_year: int
    surcharge_year: int
    surcharge_age: int
    magi: float
    irmaa_annual_cost: float
    irmaa_tier: int


class IrmaaProjection(BaseModel):
    """Summary of projected IRMAA surcharges across the timeline."""

    yearly_detail: list[IrmaaYearDetail]
    total_irmaa_cost: float
    peak_irmaa_year: int
    peak_irmaa_amount: float


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
    aca_impact: list[AcaSubsidyDetail] | None = None
    aca_summary: dict | None = None

    # RMD impact analysis
    rmd_summary: dict | None = None

    # IRMAA impact analysis
    irmaa_summary: dict | None = None


class RmdYearDetail(BaseModel):
    """Per-year RMD projection for a given conversion schedule."""

    year: int
    age: int
    trad_balance_start: float
    rmd_amount: float
    actual_distribution: float
    tax_on_distribution: float
    effective_rate: float


class RmdProjection(BaseModel):
    """Summary of projected RMD impact across retirement."""

    rmd_start_age: int
    rmd_start_year: int
    yearly_detail: list[RmdYearDetail]
    total_rmd_taxes: float
    peak_rmd_amount: float
    peak_rmd_year: int


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
    yearly_conversions: list[float]  # One amount per year in timeline
    total_conversion: float

    # Key metrics
    total_tax_on_conversions: float
    overall_effective_rate: float
    estimated_lifetime_tax_savings: float  # vs. no conversion
    npv_at_optimal: float
    npv_at_zero: float

    # Per-year detail
    yearly_detail: list[
        dict
    ]  # Per year: {income, conversion, tax_cost, effective_rate, marginal_bracket}

    # Bracket visualization data (per year)
    yearly_bracket_fill: list[list[BracketFillResult]]

    # Scenario comparisons
    scenarios: list[ScenarioComparison]

    # AI explanation data
    reasoning_trace: ReasoningTrace

    # Balance projections
    traditional_at_retirement: float
    roth_at_retirement: float

    # Income timeline chart data (income + conversion stacked bars with bracket lines)
    timeline_chart: list[dict]  # Per year: {year, income, conversion, bracket_boundaries}

    # Pre-computed conversion curve for interactive slider
    conversion_curve: list["ConversionCurvePoint"] = Field(default_factory=list)

    # Unconstrained comparison (populated when conversion_preferences are active)
    unconstrained_npv: float | None = None
    unconstrained_conversions: list[float] | None = None

    # ACA subsidy impact (populated when healthcare inputs are provided)
    aca_subsidy_impact: list[AcaSubsidyDetail] | None = None
    total_subsidy_lost: float | None = None
    subsidy_cliff_income: float | None = None
    npv_without_aca: float | None = None  # NPV from tax-only optimization for comparison

    # RMD projection (always computed — RMDs are mandatory)
    rmd_projection: RmdProjection | None = None
    rmd_projection_no_conversion: RmdProjection | None = None

    # IRMAA projection (populated when user will be on Medicare during the timeline)
    irmaa_projection: IrmaaProjection | None = None
    irmaa_projection_no_conversion: IrmaaProjection | None = None

    # Input echo
    input: ScenarioInput
