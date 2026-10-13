"""Scenario draft: the partially filled inputs shared by the conversation and the form.

The draft mirrors the calculator form field for field. The conversation fills it
through the ``record_scenario`` MCP tool; the form edits the same object in the browser. Both
sides turn a complete draft into a ``ScenarioInput`` with the same rules, so a
scenario gives identical results whichever mode produced it. The parity cases in
``shared/fixtures/scenario-draft-cases.json`` keep this module and
``frontend/src/lib/scenario/draft.ts`` in lockstep.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import math
from typing import Literal

from pydantic import BaseModel, Field

from app.engine.state_tax import _TAX_DATA
from app.engine.types import FilingStatus, HealthcareInput, PlanYear, ScenarioInput

# Valid state codes come from the same data file the engine uses.
VALID_STATES: frozenset[str] = frozenset(_TAX_DATA.get("states", {}).keys()) | {"custom"}

# Required before the optimizer can run, in the order the conversation asks for them.
REQUIRED_FIELDS: tuple[str, ...] = (
    "age",
    "filing_status",
    "current_income",
    "traditional_balance",
    "retirement_age",
)

# Inputs that regenerate the income timeline when they change (matches the form).
_TIMELINE_BASE_FIELDS = (
    "age",
    "retirement_age",
    "current_income",
    "income_growth_rate_pct",
    "current_income_end_age",
    "planning_horizon_age",
    "income_sources",
)

DEFAULT_PLANNING_HORIZON_AGE = 90


def current_year() -> int:
    return datetime.date.today().year


IncomeKind = Literal["social_security", "pension", "other"]


class IncomeSource(BaseModel):
    """A stream of income across a range of ages, such as Social Security or a pension."""

    kind: IncomeKind = "other"
    owner: Literal["you", "spouse"] = "you"
    label: str | None = Field(default=None, max_length=40)
    amount: float = Field(ge=0, description="Yearly amount in dollars")
    start_age: int = Field(ge=0, le=120, description="The user's age in the first year")
    end_age: int | None = Field(
        default=None, ge=0, le=120, description="The user's age in the last year. Null = plan end."
    )


class ScenarioDraft(BaseModel):
    """Scenario inputs as the user gives them. ``None`` means not provided yet."""

    age: int | None = Field(default=None, ge=0, le=120)
    filing_status: FilingStatus | None = None
    state: str | None = Field(
        default=None, description="State code, 'custom', or null for federal only"
    )
    retirement_state: str | None = Field(
        default=None, description="State in retirement. Null means same as `state`."
    )
    custom_state_rate_pct: float | None = Field(default=None, ge=0, le=20)
    current_income: float | None = Field(default=None, ge=0)
    current_income_end_age: int | None = Field(default=None, ge=0, le=120)
    income_growth_rate_pct: float | None = 3
    traditional_balance: float | None = Field(default=None, ge=0)
    roth_balance: float | None = Field(default=None, ge=0)
    retirement_age: int | None = Field(default=None, ge=1, le=120)
    retirement_spending: float | None = Field(default=None, ge=0)
    planning_horizon_age: int | None = Field(default=90, ge=50, le=120)
    investment_return_pct: float | None = 7
    discount_rate_pct: float | None = 5
    include_aca: bool = False
    household_size: int | None = Field(default=1, ge=1)
    monthly_slcsp_premium: float | None = Field(default=620, ge=0)
    employer_coverage_year: int | None = None
    income_sources: list[IncomeSource] = Field(default_factory=list)
    timeline: list[PlanYear] = Field(default_factory=list)


def generate_timeline(
    age: int,
    retirement_age: int,
    base_income: float,
    growth_pct: float,
    start_year: int,
    planning_horizon_age: int = DEFAULT_PLANNING_HORIZON_AGE,
    sources: list[IncomeSource] | None = None,
    base_end_age: int | None = None,
) -> list[PlanYear]:
    """Project income from today through the plan's last year (port of ``generateTimeline``).

    Current income (growing at ``growth_pct``) runs until ``base_end_age``: by default the
    year before retirement, or the whole plan for someone already retired. Each income
    source adds its amount for the ages it covers.
    """
    length = max(1, planning_horizon_age - age + 1)
    if base_end_age is None:
        base_end_age = retirement_age - 1 if retirement_age > age else planning_horizon_age
    rows = []
    for i in range(length):
        year_age = age + i
        income = base_income * (1 + growth_pct / 100) ** i if year_age <= base_end_age else 0.0
        for src in sources or []:
            end = planning_horizon_age if src.end_age is None else src.end_age
            if src.start_age <= year_age <= end:
                income += src.amount
        rows.append(PlanYear(year=start_year + i, gross_income=_js_round(income)))
    return rows


_KIND_LABELS = {"social_security": "Social Security", "pension": "Pension", "other": "Other income"}


def source_label(src: IncomeSource) -> str:
    """Display name, e.g. "Social Security (spouse)"."""
    name = src.label or _KIND_LABELS[src.kind]
    return f"{name} (spouse)" if src.owner == "spouse" else name


def projected_timeline(draft: ScenarioDraft, start_year: int) -> list[PlanYear]:
    """The timeline a complete draft projects before any per-year edits."""
    return generate_timeline(
        draft.age,
        draft.retirement_age,
        draft.current_income,
        draft.income_growth_rate_pct or 0,
        start_year,
        _or(draft.planning_horizon_age, DEFAULT_PLANNING_HORIZON_AGE),
        draft.income_sources,
        draft.current_income_end_age,
    )


def merge_timeline(fresh: list[PlanYear], existing: list[PlanYear]) -> list[PlanYear]:
    """Keep rows the user customized (a note or a state override), regenerate the rest."""
    pinned = {row.year: row for row in existing if row.notes or row.state is not None}
    return [pinned.get(row.year, row) for row in fresh]


def sync_timeline(draft: ScenarioDraft, previous: ScenarioDraft | None, start_year: int) -> None:
    """Regenerate the timeline when the inputs it depends on change (mutates ``draft``)."""
    if previous is not None and all(
        getattr(draft, f) == getattr(previous, f) for f in _TIMELINE_BASE_FIELDS
    ):
        return
    if (
        draft.age is None
        or draft.retirement_age is None
        or draft.current_income is None
        or draft.current_income <= 0
    ):
        draft.timeline = []
        return
    fresh = projected_timeline(draft, start_year)
    draft.timeline = merge_timeline(fresh, draft.timeline) if draft.timeline else fresh


def missing_fields(draft: ScenarioDraft) -> list[str]:
    missing = []
    for name in REQUIRED_FIELDS:
        value = getattr(draft, name)
        if value is None or (name in ("current_income", "traditional_balance") and value <= 0):
            missing.append(name)
    return missing


def validation_errors(draft: ScenarioDraft) -> list[str]:
    """Problems that block a run beyond missing fields (mirrors the form's checks)."""
    errors = []
    for field in ("state", "retirement_state"):
        value = getattr(draft, field)
        if value is not None and value not in VALID_STATES:
            errors.append(f"{field} '{value}' is not a supported state code")
    if not draft.timeline and not missing_fields(draft):
        errors.append("timeline is empty")
    if any(row.gross_income < 0 for row in draft.timeline):
        errors.append("timeline income cannot be negative")
    for src in draft.income_sources:
        if src.end_age is not None and src.end_age < src.start_age:
            errors.append(f"income source '{source_label(src)}' ends before it starts")
    return errors


def build_scenario_input(draft: ScenarioDraft) -> ScenarioInput:
    """Turn a complete draft into engine input (port of the form's submit handler)."""
    missing = missing_fields(draft)
    errors = validation_errors(draft)
    if missing or errors:
        raise ValueError(
            "Scenario is not ready: " + ", ".join([*(f"missing {m}" for m in missing), *errors])
        )
    healthcare = (
        HealthcareInput(
            household_size=_or(draft.household_size, 1),
            monthly_slcsp_premium=draft.monthly_slcsp_premium or 620,
            has_employer_coverage_after=draft.employer_coverage_year,
        )
        if draft.include_aca
        else None
    )
    retirement_state = (
        draft.retirement_state
        if draft.retirement_state is not None and draft.retirement_state != draft.state
        else None
    )
    return ScenarioInput(
        age=draft.age,
        filing_status=draft.filing_status,
        timeline=draft.timeline,
        traditional_ira_balance=draft.traditional_balance,
        roth_ira_balance=draft.roth_balance or 0,
        drawdown_start_age=draft.retirement_age,
        planning_horizon_age=_or(draft.planning_horizon_age, DEFAULT_PLANNING_HORIZON_AGE),
        default_drawdown=draft.retirement_spending or None,
        annual_growth_rate=_or(draft.investment_return_pct, 7) / 100,
        discount_rate=_or(draft.discount_rate_pct, 5) / 100,
        healthcare=healthcare,
        state=draft.state,
        retirement_state=retirement_state,
        custom_state_rate=(
            draft.custom_state_rate_pct / 100
            if draft.state == "custom" and draft.custom_state_rate_pct
            else None
        ),
    )


def draft_hash(draft: ScenarioDraft) -> str:
    payload = json.dumps(draft.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()[:12]


def _or(value, default):
    """JavaScript ``??``: fall back only when the value is missing."""
    return default if value is None else value


def _js_round(value: float) -> float:
    """Math.round semantics (half rounds up), so both sides produce identical incomes."""
    return float(math.floor(value + 0.5))
