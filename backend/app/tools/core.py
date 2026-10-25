"""Transport-neutral tool logic.

Plain functions over Pydantic models. The web agent (``app.agent``) and the MCP
server (``app.mcp``) are thin adapters on top of these, so both surfaces give the
same answers. Every number returned here comes from the engine.
"""

from __future__ import annotations

import hashlib
import json
import math
import threading
from collections import OrderedDict
from functools import cache
from pathlib import Path

from app.engine.inflation import nominal_scale
from app.engine.optimizer import optimize
from app.engine.state_tax import _TAX_DATA
from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
from app.engine.types import FilingStatus, OptimizationResult, PlanYear, ScenarioInput
from app.tools.draft import (
    BIRTH_REASON,
    VALID_STATES,
    ScenarioDraft,
    build_scenario_input,
    draft_hash,
    missing_fields,
    projected_timeline,
    sync_timeline,
    validation_errors,
)
from app.tools.models import ScenarioUpdate

_ENGINE_DIR = Path(__file__).resolve().parent.parent / "engine"
_CONTENT_FILE = Path(__file__).resolve().parent.parent / "content" / "methodology.json"


class ToolError(ValueError):
    """A problem the model can fix by changing its call. The message is shown to it."""


# --------------------------------------------------------------------------
# Scenario updates
# --------------------------------------------------------------------------


def apply_update(draft: ScenarioDraft, update: ScenarioUpdate, start_year: int) -> ScenarioDraft:
    """Return a new draft with ``update`` applied. Raises ToolError on bad values."""
    new = draft.model_copy(deep=True)
    fields = update.model_dump(exclude_none=True, exclude={"income_changes"})

    for key in ("state", "retirement_state"):
        if key in fields:
            try:
                fields[key] = _normalize_state(str(fields[key]))
            except ToolError as err:
                raise ToolError(
                    f"{err} Use 'custom' with custom_state_rate_pct, or 'none' for federal only."
                ) from err
    if "state" in fields and "retirement_state" not in fields:
        # Matches the form: choosing a state also sets the retirement state.
        fields["retirement_state"] = fields["state"]
    if fields.get("retirement_spending") == 0:
        fields["retirement_spending"] = None

    new = ScenarioDraft.model_validate({**new.model_dump(), **fields})
    sync_timeline(new, draft, start_year)

    for change in sorted(update.income_changes or [], key=lambda c: c.year):
        new.timeline = _apply_income_change(new.timeline, change)
    return new


def _normalize_state(code: str | None) -> str | None:
    if code is None:
        return None
    code = code.strip()
    if code.lower() in ("none", "federal", ""):
        return None
    code = "custom" if code.lower() == "custom" else code.upper()
    if code not in VALID_STATES:
        raise ToolError(f"Unknown state '{code}'. Use a two-letter code.")
    return code


def _apply_income_change(timeline: list[PlanYear], change) -> list[PlanYear]:
    if not timeline:
        raise ToolError(
            "The timeline is empty. Record age, current_income and retirement_age before "
            "per-year income changes."
        )
    first, last = timeline[0].year, timeline[-1].year
    state = _normalize_state(change.state)
    if change.year == last + 1:
        # Directly after the projection: extend it (the form's "add year").
        return [
            *timeline,
            PlanYear(
                year=change.year, gross_income=change.gross_income, notes=change.note, state=state
            ),
        ]
    if not first <= change.year <= last:
        raise ToolError(
            f"Year {change.year} is outside the timeline ({first} to {last}). The timeline runs "
            "from this year until planning_horizon_age."
        )
    return [
        PlanYear(
            year=row.year,
            gross_income=change.gross_income,
            notes=change.note,
            state=state if change.state is not None else row.state,
            drawdown=row.drawdown,
        )
        if row.year == change.year
        else row
        for row in timeline
    ]


# Note given to timeline rows the user edited in the form without writing a reason.
EDITED_NOTE = "Edited in the form"


def scenario_from_draft(draft: ScenarioDraft, start_year: int) -> dict:
    """The stateless scenario for a draft: its values plus any year that differs from the
    projection. ``draft_from_scenario`` turns it back into the same timeline."""
    scenario = draft.model_dump(mode="json", exclude={"timeline", "age"}, exclude_none=True)
    if not scenario.get("income_sources"):
        scenario.pop("income_sources", None)
    projected: dict[int, float] = {}
    if (
        draft.age is not None
        and draft.retirement_age is not None
        and draft.current_income is not None
    ):
        projected = {row.year: row.gross_income for row in projected_timeline(draft, start_year)}
    changes = []
    for row in draft.timeline:
        if row.notes or row.state is not None or projected.get(row.year) != row.gross_income:
            changes.append(
                {
                    "year": row.year,
                    "gross_income": row.gross_income,
                    "note": row.notes or EDITED_NOTE,
                    **({"state": row.state} if row.state is not None else {}),
                }
            )
    if changes:
        scenario["income_changes"] = changes
    return scenario


def scenario_from_input(inputs: ScenarioInput, start_year: int) -> dict:
    """An approximate stateless scenario for engine input saved on the website, which
    keeps only the engine's form of it. Years before ``start_year`` are dropped and the
    income growth rate is read off the first two years.

    Input saved before inflation was modeled has no ``inflation_rate``: its per-year
    incomes are compared with a projection without inflation, so only the years the
    user changed carry over, and the scenario then uses the default inflation."""
    timeline = inputs.timeline
    legacy = "inflation_rate" not in inputs.model_fields_set
    inflation_pct = 0.0 if legacy else inputs.inflation_rate * 100
    first = timeline[0].gross_income
    growth = 0.0
    if len(timeline) > 1 and first > 0:
        ratio = timeline[1].gross_income / first * (1 + inflation_pct / 100)
        growth = round((ratio - 1) * 100, 1)
    healthcare = inputs.healthcare
    draft = ScenarioDraft(
        birth_year=timeline[0].year - inputs.age,
        age=inputs.age + max(0, start_year - timeline[0].year),
        spouse_birth_year=(
            timeline[0].year - inputs.spouse_age if inputs.spouse_age is not None else None
        ),
        birth_month=inputs.birth_month,
        filing_status=inputs.filing_status,
        state=inputs.state,
        retirement_state=inputs.retirement_state,
        custom_state_rate_pct=(
            inputs.custom_state_rate * 100 if inputs.custom_state_rate is not None else None
        ),
        current_income=first,
        income_growth_rate_pct=max(-10.0, min(20.0, growth)),
        traditional_balance=inputs.traditional_ira_balance,
        roth_balance=inputs.roth_ira_balance,
        retirement_age=inputs.drawdown_start_age,
        retirement_spending=inputs.default_drawdown,
        planning_horizon_age=inputs.planning_horizon_age,
        investment_return_pct=round(inputs.annual_growth_rate * 100, 2),
        discount_rate_pct=round(inputs.discount_rate * 100, 2),
        inflation_pct=round(inflation_pct, 2),
        include_aca=healthcare is not None,
        household_size=healthcare.household_size if healthcare else 1,
        monthly_slcsp_premium=healthcare.monthly_slcsp_premium if healthcare else 620,
        employer_coverage_year=healthcare.has_employer_coverage_after if healthcare else None,
        timeline=[row for row in timeline if row.year >= start_year],
    )
    scenario = scenario_from_draft(draft, start_year)
    if legacy:
        del scenario["inflation_pct"]
    if "income_changes" in scenario:
        # Keep the per-year incomes only if they still fit this year's timeline.
        try:
            draft_from_scenario(ScenarioUpdate.model_validate(scenario), start_year)
        except (ToolError, ValueError):
            del scenario["income_changes"]
    return scenario


def upgrade_scenario(scenario: dict, year: int) -> dict:
    """A scenario saved before birth dates were asked for gives the user's age in ``year``;
    turn it into a birth year. The month is left for the user to fill in."""
    if "age" not in scenario:
        return scenario
    upgraded = {k: v for k, v in scenario.items() if k != "age"}
    if "birth_year" not in upgraded and isinstance(scenario["age"], int):
        upgraded["birth_year"] = year - scenario["age"]
    return upgraded


def draft_from_scenario(scenario: ScenarioUpdate, start_year: int) -> ScenarioDraft:
    return apply_update(ScenarioDraft(), scenario, start_year)


def describe_draft(draft: ScenarioDraft, start_year: int) -> dict:
    """What a model needs about a scenario: the values to pass to the next tool call, the
    projected timeline, and what is still missing."""
    timeline = [
        {
            "year": row.year,
            "gross_income": row.gross_income,
            **({"note": row.notes} if row.notes else {}),
        }
        for row in draft.timeline
    ]
    missing = missing_fields(draft)
    errors = validation_errors(draft)
    return {
        "scenario": scenario_from_draft(draft, start_year),
        "timeline": timeline,
        "missing_required": missing,
        **({"why_birth_date": BIRTH_REASON} if any("birth" in m for m in missing) else {}),
        "problems": errors,
        "ready_to_run": not missing and not errors,
        "draft_hash": draft_hash(draft),
    }


# --------------------------------------------------------------------------
# Optimization
# --------------------------------------------------------------------------


@cache
def engine_version() -> str:
    """Hash of the engine source, used to invalidate anything derived from engine output."""
    digest = hashlib.sha256()
    for path in sorted(_ENGINE_DIR.glob("*.py")):
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def scenario_key(scenario: ScenarioInput) -> str:
    payload = json.dumps(scenario.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


def result_id_for(scenario: ScenarioInput) -> str:
    return "r_" + scenario_key(scenario)[:10]


class _ResultCache:
    """Small LRU so repeated runs of the same scenario (what-if bases) are instant."""

    def __init__(self, size: int = 64):
        self._size = size
        self._data: OrderedDict[str, OptimizationResult] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, scenario: ScenarioInput) -> OptimizationResult | None:
        key = scenario_key(scenario)
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                return self._data[key]
            return None

    def get_or_compute(self, scenario: ScenarioInput) -> OptimizationResult:
        cached = self.get(scenario)
        if cached is not None:
            return cached
        result = optimize(scenario)
        with self._lock:
            self._data[scenario_key(scenario)] = result
            while len(self._data) > self._size:
                self._data.popitem(last=False)
        return result


_results = _ResultCache()


def run_optimization(scenario: ScenarioInput) -> OptimizationResult:
    return _results.get_or_compute(scenario)


def cached_result(scenario: ScenarioInput) -> OptimizationResult | None:
    """The already computed result, or None. Holding the result (rather than only
    checking for it) keeps it usable even if the LRU evicts it a moment later."""
    return _results.get(scenario)


def scenario_input(draft: ScenarioDraft) -> ScenarioInput:
    try:
        return build_scenario_input(draft)
    except ValueError as err:
        raise ToolError(str(err)) from err


def run_draft(draft: ScenarioDraft) -> tuple[ScenarioInput, OptimizationResult]:
    scenario = scenario_input(draft)
    return scenario, run_optimization(scenario)


def _in_that_years_dollars(result: OptimizationResult, t: int, amount: float) -> dict:
    """The amount in plan year ``t``'s own dollars, when inflation makes it differ."""
    scale = nominal_scale(result.input.inflation_rate, t)
    if scale == 1.0 or not amount:
        return {}
    return {"conversion_in_that_years_dollars": round(amount * scale)}


def summarize_result(result: OptimizationResult, result_id: str) -> dict:
    """Everything a model needs to explain a result, without the chart payloads.

    Amounts are in today's dollars; each later conversion also comes in that
    year's own dollars, the amount that would actually be converted then.
    """
    trace = result.reasoning_trace
    schedule = [
        {
            "year": d["year"],
            "income": round(d["income"]),
            "conversion": round(d["conversion"]),
            **_in_that_years_dollars(result, t, d["conversion"]),
            "tax_on_conversion": round(d["tax_cost"]),
            "marginal_bracket": d.get("marginal_bracket"),
            **({"rmd": round(d["rmd"])} if d.get("rmd") else {}),
            **(
                {"spending_from_traditional": round(d["spending_from_traditional"])}
                if d.get("spending_from_traditional")
                else {}
            ),
            **(
                {"spending_from_roth": round(d["spending_from_roth"])}
                if d.get("spending_from_roth")
                else {}
            ),
        }
        for t, d in enumerate(result.yearly_detail)
    ]
    summary = {
        "result_id": result_id,
        "estimated_lifetime_tax_savings_todays_dollars": round(
            result.estimated_lifetime_tax_savings
        ),
        "total_conversion": round(result.total_conversion),
        "total_tax_on_conversions": round(result.total_tax_on_conversions),
        "average_tax_rate_on_conversions": round(result.overall_effective_rate, 4),
        "years_with_conversions": sum(1 for c in result.yearly_conversions if c > 0),
        "schedule_by_year": schedule,
        "balances_at_retirement": {
            "traditional": round(result.traditional_at_retirement),
            "roth": round(result.roth_at_retirement),
        },
        "alternatives": [
            {
                "label": s.label,
                "total_conversion": round(s.conversion_amount),
                "estimated_lifetime_tax_savings": round(s.estimated_savings),
            }
            for s in result.scenarios
        ],
        "reasoning": {
            "binding_constraint": trace.binding_constraint,
            "marginal_tax_rate_at_optimal": trace.marginal_tax_rate_at_optimal,
            "cost_of_next_bracket": trace.cost_of_next_bracket,
            "benefit_of_current_bracket": trace.benefit_of_current_bracket,
            "summary_points": trace.summary_points,
            "sensitivity_notes": trace.sensitivity_notes,
        },
        "assumptions": {
            "amounts_in": "today's dollars",
            "investment_return": result.input.annual_growth_rate,
            "discount_rate": result.input.discount_rate,
            "inflation": result.input.inflation_rate,
            "planning_horizon_age": result.input.planning_horizon_age,
            "retirement_spending": result.input.default_drawdown or "4% rule",
            "state": result.input.state or "federal only",
            "retirement_state": result.input.retirement_state
            or result.input.state
            or "federal only",
        },
    }
    for key in ("rmd_summary", "irmaa_summary", "aca_summary", "early_withdrawal_summary"):
        value = getattr(trace, key)
        if value:
            summary["reasoning"][key] = value
    if result.total_subsidy_lost:
        summary["aca_total_subsidy_lost"] = round(result.total_subsidy_lost)
    return summary


def _half_up(value: float) -> int:
    """JavaScript ``Math.round``: the web app rebuilds comparisons from the same results,
    so halves must round the same way on both sides (Python's ``round`` rounds to even)."""
    return math.floor(value + 0.5)


def _tax_breakdown(result: OptimizationResult) -> dict:
    """Savings split into what the conversions cost and what they avoid, today's dollars."""
    paid = _half_up(result.conversion_cost_today)
    return {
        "paid_now": paid,
        "avoided_later": paid + _half_up(result.estimated_lifetime_tax_savings),
    }


def compare_results(
    base: OptimizationResult, variant: OptimizationResult, base_id: str, variant_id: str, label: str
) -> dict:
    years = sorted(
        {d["year"] for d in base.yearly_detail} | {d["year"] for d in variant.yearly_detail}
    )
    by_year_base = {d["year"]: d["conversion"] for d in base.yearly_detail}
    by_year_variant = {d["year"]: d["conversion"] for d in variant.yearly_detail}
    return {
        "label": label,
        "base_result_id": base_id,
        "variant_result_id": variant_id,
        "estimated_lifetime_tax_savings": {
            "current": _half_up(base.estimated_lifetime_tax_savings),
            "what_if": _half_up(variant.estimated_lifetime_tax_savings),
            "difference": _half_up(
                variant.estimated_lifetime_tax_savings - base.estimated_lifetime_tax_savings
            ),
        },
        "tax_breakdown": {
            "current": _tax_breakdown(base),
            "what_if": _tax_breakdown(variant),
        },
        "total_conversion": {
            "current": _half_up(base.total_conversion),
            "what_if": _half_up(variant.total_conversion),
        },
        "total_tax_on_conversions": {
            "current": _half_up(base.total_tax_on_conversions),
            "what_if": _half_up(variant.total_tax_on_conversions),
        },
        "conversions_by_year": [
            {
                "year": y,
                "current": _half_up(by_year_base.get(y, 0)),
                "what_if": _half_up(by_year_variant.get(y, 0)),
            }
            for y in years
        ],
        "what_if_reasoning": variant.reasoning_trace.summary_points,
    }


# --------------------------------------------------------------------------
# Reference data
# --------------------------------------------------------------------------


def _tier_amount(tier: dict, key: str) -> float | str:
    amount = tier["amount"]
    if isinstance(amount, dict):
        amount = amount[key]
    return "no limit" if amount is None else amount


def tax_brackets(filing_status: FilingStatus, state: str | None = None) -> dict:
    def serialize(brackets: list[dict]) -> list[dict]:
        return [
            {
                "rate": b["rate"],
                "income_from": b["min"],
                "income_to": None if b["max"] == float("inf") else b["max"],
            }
            for b in brackets
        ]

    out = {
        "tax_year": 2026,
        "filing_status": filing_status.value,
        "federal": {
            "standard_deduction": STANDARD_DEDUCTION[filing_status],
            "brackets_on_taxable_income": serialize(BRACKETS[filing_status]),
        },
    }
    if state:
        code = state.upper()
        data = _TAX_DATA.get("states", {}).get(code)
        if data is None:
            raise ToolError(f"Unknown state '{state}'. Use a two-letter code.")
        if not data.get("has_income_tax", False):
            out["state"] = {"code": code, "has_income_tax": False}
        else:
            key = "single" if filing_status == FilingStatus.SINGLE else "married_filing_jointly"
            out["state"] = {
                "code": code,
                "has_income_tax": True,
                "standard_deduction": data.get("standard_deduction", {}).get(key),
                "brackets_on_taxable_income": serialize(data.get("brackets", {}).get(key, [])),
            }
            rule = data.get("retirement_income")
            out["state"]["retirement_income"] = (
                {
                    "summary": rule["summary"],
                    "exclusions_by_age": [
                        {
                            "from_age": tier["min_age"],
                            "max_excluded_per_year": _tier_amount(tier, key),
                        }
                        for tier in rule["tiers"]
                    ],
                    **({"note": rule["note"]} if rule.get("note") else {}),
                    "sources": rule["sources"],
                }
                if rule
                else {
                    "summary": "IRA and 401(k) withdrawals and Roth conversions are taxed in full."
                }
            )
    return out


@cache
def _methodology() -> dict[str, dict]:
    data = json.loads(_CONTENT_FILE.read_text())
    return {section["id"]: section for section in data["sections"]}


def methodology_topics() -> list[dict]:
    return [{"id": s["id"], "title": s["title"]} for s in _methodology().values()]


def methodology_text(topic: str) -> str:
    section = _methodology().get(topic)
    if section is None:
        raise ToolError(f"Unknown topic '{topic}'.")
    parts = [f"# {section['title']}"]
    for block in section["blocks"]:
        if block.get("heading"):
            parts.append(f"## {block['heading']}")
        parts.append(block["text"])
    return "\n\n".join(parts)
