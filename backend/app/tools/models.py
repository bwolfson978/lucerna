"""Pydantic models for tool inputs. JSON schemas for every transport come from these."""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.engine.types import FilingStatus


class IncomeChange(BaseModel):
    """Set one year's income in the projected timeline."""

    model_config = ConfigDict(extra="forbid")

    year: int = Field(description="Calendar year within the timeline")
    gross_income: float = Field(
        ge=0, description="Total gross income that year, in today's dollars"
    )
    note: str = Field(
        min_length=1,
        max_length=60,
        description="Short reason shown in the timeline, e.g. 'Career break' or 'Social Security starts'",
    )
    state: str | None = Field(
        default=None, description="Two-letter state code if they live somewhere else that year"
    )


class IncomeSourceInput(BaseModel):
    """Income that runs across a range of ages: Social Security, a pension, rental income."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["social_security", "pension", "other"] = Field(
        description="social_security, pension, or other (rental, annuity, part-time work)"
    )
    owner: Literal["you", "spouse"] = Field(
        default="you", description="Whose income it is. Ages are always the user's age."
    )
    label: str | None = Field(
        default=None, max_length=40, description="Short name for 'other' income, e.g. 'Rental'"
    )
    amount: float = Field(
        ge=0,
        description=(
            "Yearly amount in dollars (monthly x 12) as on their statement: Social Security "
            "statements show today's dollars, pensions the amount paid"
        ),
    )
    start_age: int = Field(ge=0, le=120, description="The user's age in the year it starts")
    end_age: int | None = Field(
        default=None,
        ge=0,
        le=120,
        description="The user's age in its last year. Omit if it lasts for life.",
    )


class ScenarioUpdate(BaseModel):
    """A Roth conversion scenario. Every field is optional; include only what the user stated
    (or what a previous tool result returned as `scenario`)."""

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _no_age(cls, data):
        if isinstance(data, dict) and "age" in data:
            raise ValueError(
                "age is not an input: ask the user for the month and year they were born "
                "(birth_month, birth_year), and their spouse's when filing jointly. Tell them: "
                "some parts of the analysis depend on the month and year you were born."
            )
        return data

    birth_year: int | None = Field(default=None, ge=1900, le=2100, description="Year born")
    birth_month: int | None = Field(
        default=None, ge=1, le=12, description="Month born, 1 (January) to 12 (December)"
    )
    filing_status: FilingStatus | None = None
    spouse_birth_year: int | None = Field(
        default=None, ge=1900, le=2100, description="Spouse's year born, when filing jointly"
    )
    spouse_birth_month: int | None = Field(
        default=None, ge=1, le=12, description="Spouse's month born, 1 to 12, when filing jointly"
    )
    current_income: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Household earned income this year (wages and self-employment), in dollars. "
            "0 when no one is working. Social Security, pensions and other lasting income "
            "belong in income_sources, and retirement account withdrawals come from "
            "retirement_spending, so neither is included here."
        ),
    )
    current_income_end_age: int | None = Field(
        default=None,
        ge=0,
        le=120,
        description=(
            "Their age in the last year current_income is earned, if it stops before "
            "retirement_age (for example when Social Security replaces it). Default: the year "
            "before retirement_age, or for life if already retired."
        ),
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
        description="Expected yearly raises until retirement, percent. Default 3.",
    )
    retirement_spending: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Total yearly household spending once they start drawing on the accounts, in "
            "today's dollars. Income that year (Social Security, pensions) covers part of it and the "
            "accounts cover the rest. Omit to use the 4% rule on the accounts."
        ),
    )
    income_sources: list[IncomeSourceInput] | None = Field(
        default=None,
        description=(
            "Income that runs across years: Social Security (one per person), pensions, rental "
            "income, annuities. Pass the complete list; it replaces the previous one. Prefer "
            "this over income_changes for anything lasting more than a year."
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
        description="Expected yearly investment return, percent, as usually quoted. Default 7.",
    )
    discount_rate_pct: float | None = Field(
        default=None,
        ge=0,
        le=30,
        description="Yearly rate future amounts are discounted at, percent. Default 5.",
    )
    inflation_pct: float | None = Field(
        default=None,
        ge=0,
        le=10,
        description="Expected yearly inflation, percent. Default 2.5.",
    )
    include_aca: bool | None = Field(
        default=None,
        description=(
            "True if they buy health insurance on the ACA marketplace before 65. Years whose "
            "income alone is over 400% of the poverty level (usually working years) get no "
            "subsidy and are left out."
        ),
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
            "One-off income for a single year that differs from the projection: a career break, "
            "a bonus, a year of part-time work. Years must fall inside the timeline (this year "
            "until planning_horizon_age). Use income_sources for income that lasts."
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
    SUGGESTIONS = "suggestions"


class ShowArgs(BaseModel):
    """Input for the web-only `show` tool (display only, not part of the MCP server)."""

    model_config = ConfigDict(extra="forbid")

    kind: DisplayKind = Field(
        description=(
            "scenario_summary: the captured inputs for the user to check before running. "
            "suggestions: 2 to 4 short follow-up questions the user can tap."
        )
    )
    suggestions: list[str] | None = Field(
        default=None, max_length=4, description="Follow-up questions, each under 60 characters"
    )
