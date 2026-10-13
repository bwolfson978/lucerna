"""Pydantic models for tool inputs. JSON schemas for every transport come from these."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.engine.types import FilingStatus


class IncomeChange(BaseModel):
    """Set one year's income in the projected timeline."""

    model_config = ConfigDict(extra="forbid")

    year: int = Field(description="Calendar year within the timeline")
    gross_income: float = Field(ge=0, description="Total gross income that year, in dollars")
    note: str = Field(
        min_length=1,
        max_length=60,
        description="Short reason shown in the timeline, e.g. 'Sabbatical' or 'Social Security starts'",
    )
    state: str | None = Field(
        default=None, description="Two-letter state code if they live somewhere else that year"
    )


class ScenarioUpdate(BaseModel):
    """A Roth conversion scenario. Every field is optional; include only what the user stated
    (or what a previous tool result returned as `scenario`)."""

    model_config = ConfigDict(extra="forbid")

    age: int | None = Field(default=None, ge=0, le=120, description="Current age")
    filing_status: FilingStatus | None = None
    current_income: float | None = Field(
        default=None,
        gt=0,
        description="Gross household income this year, in dollars (wages, pensions, Social Security, etc.)",
    )
    traditional_balance: float | None = Field(
        default=None,
        gt=0,
        description="Traditional IRA plus rolled-over or old pre-tax 401(k) balances, in dollars",
    )
    roth_balance: float | None = Field(
        default=None, ge=0, description="Existing Roth IRA/401(k) balance, in dollars"
    )
    retirement_age: int | None = Field(
        default=None,
        ge=1,
        le=120,
        description=(
            "Age when withdrawals from retirement accounts begin (when they stop working). "
            "If already retired and living on other savings, the age they will start drawing "
            "on these accounts."
        ),
    )
    income_growth_rate_pct: float | None = Field(
        default=None,
        ge=-10,
        le=20,
        description="Expected annual income growth until retirement, percent. Default 3.",
    )
    retirement_spending: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Total yearly household spending in retirement, in dollars, including the part "
            "Social Security and pensions pay for. Omit to use the 4% rule on the accounts."
        ),
    )
    retirement_income: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Yearly Social Security, pension and other income once they start drawing on these "
            "accounts (from retirement_age, or after the last timeline year if later), in dollars. "
            "It covers part of retirement_spending and is taxed before account withdrawals."
        ),
    )
    state: str | None = Field(
        default=None,
        description="Two-letter state code for where they live now, 'custom' for a flat rate, or 'none' for federal only",
    )
    retirement_state: str | None = Field(
        default=None,
        description="Two-letter state code for where they will live in retirement, if different",
    )
    custom_state_rate_pct: float | None = Field(
        default=None, ge=0, le=20, description="Flat state rate in percent when state is 'custom'"
    )
    planning_horizon_age: int | None = Field(
        default=None, ge=50, le=120, description="Age the plan runs to. Default 90."
    )
    investment_return_pct: float | None = Field(
        default=None,
        ge=-10,
        le=30,
        description="Expected annual investment return, percent. Default 7.",
    )
    discount_rate_pct: float | None = Field(
        default=None,
        ge=0,
        le=30,
        description="Discount rate for today's dollars, percent. Default 5.",
    )
    include_aca: bool | None = Field(
        default=None, description="True if they buy health insurance on the ACA marketplace"
    )
    household_size: int | None = Field(default=None, ge=1, le=12)
    monthly_slcsp_premium: float | None = Field(
        default=None,
        ge=0,
        description="Monthly benchmark silver plan premium, dollars. Default 620.",
    )
    employer_coverage_year: int | None = Field(
        default=None, description="Calendar year employer health coverage resumes, if any"
    )
    income_changes: list[IncomeChange] | None = Field(
        default=None,
        description=(
            "Per-year income that differs from the projection: job changes, sabbaticals, "
            "Social Security starting, part-time work. Years must fall inside the timeline "
            "(this year until retirement_age) or directly extend it."
        ),
    )


class MethodologyTopic(StrEnum):
    SAVINGS_NUMBER = "savings-number"
    BRACKET_FILLING = "bracket-filling"
    CONVERSION_TRADEOFF = "conversion-tradeoff"
    MULTI_YEAR_ALLOCATION = "multi-year-allocation"
    ASSUMPTIONS_LIMITATIONS = "assumptions-limitations"
    WHAT_IS_A_ROTH_CONVERSION = "what-is-a-roth-conversion"
    HOW_THE_OPTIMIZER_WORKS = "how-the-optimizer-works"
    RMDS = "rmds"
    ACA_SUBSIDIES = "aca-subsidies"
    IRMAA = "irmaa"
    STATE_TAXES = "state-taxes"
    USING_THIS_TOOL = "using-this-tool"


class DisplayKind(StrEnum):
    SCENARIO_SUMMARY = "scenario_summary"
    BALANCE_COMPARISON = "balance_comparison"
    SUGGESTIONS = "suggestions"


class ShowArgs(BaseModel):
    """Input for the web-only `show` tool (display only, not part of the MCP server)."""

    model_config = ConfigDict(extra="forbid")

    kind: DisplayKind = Field(
        description=(
            "scenario_summary: the captured inputs for the user to check before running. "
            "balance_comparison: account balances with vs. without conversions (needs result_id). "
            "suggestions: 2 to 4 short follow-up questions the user can tap."
        )
    )
    result_id: str | None = Field(default=None, description="Result to chart, from a tool result")
    suggestions: list[str] | None = Field(
        default=None, max_length=4, description="Follow-up questions, each under 60 characters"
    )
