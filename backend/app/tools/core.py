"""Transport-neutral tool logic.

Plain functions over Pydantic models. The web agent (``app.agent``) and the MCP
server (``app.mcp``) are thin adapters on top of these, so both surfaces give the
same answers. Every number returned here comes from the engine.
"""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from functools import cache
from pathlib import Path

from app.engine.optimizer import optimize
from app.engine.state_tax import _TAX_DATA
from app.engine.tax import BRACKETS, STANDARD_DEDUCTION
from app.engine.types import FilingStatus, OptimizationResult, PlanYear, ScenarioInput
from app.tools.draft import (
    VALID_STATES,
    ScenarioDraft,
    build_scenario_input,
    draft_hash,
    generate_timeline,
    missing_fields,
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
    for key in ("retirement_spending", "retirement_income"):
        if fields.get(key) == 0:
            fields[key] = None

    for key, value in fields.items():
        setattr(new, key, value)

    new = ScenarioDraft.model_validate(new.model_dump())
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
            "from this year until retirement_age; adjust retirement_age if the plan extends further."
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
    scenario = draft.model_dump(mode="json", exclude={"timeline"}, exclude_none=True)
    projected: dict[int, float] = {}
    if draft.age is not None and draft.retirement_age is not None and draft.current_income:
        projected = {
            row.year: row.gross_income
            for row in generate_timeline(
                draft.age,
                draft.retirement_age,
                draft.current_income,
                draft.income_growth_rate_pct or 0,
                start_year,
            )
        }
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

    def get_or_compute(self, scenario: ScenarioInput) -> OptimizationResult:
        key = scenario_key(scenario)
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                return self._data[key]
        result = optimize(scenario)
        with self._lock:
            self._data[key] = result
            while len(self._data) > self._size:
                self._data.popitem(last=False)
        return result


_results = _ResultCache()


def run_optimization(scenario: ScenarioInput) -> OptimizationResult:
    return _results.get_or_compute(scenario)


def run_draft(draft: ScenarioDraft) -> tuple[ScenarioInput, OptimizationResult]:
    try:
        scenario = build_scenario_input(draft)
    except ValueError as err:
        raise ToolError(str(err)) from err
    return scenario, run_optimization(scenario)


def summarize_result(result: OptimizationResult, result_id: str) -> dict:
    """Everything a model needs to explain a result, without the chart payloads."""
    trace = result.reasoning_trace
    schedule = [
        {
            "year": d["year"],
            "income": round(d["income"]),
            "conversion": round(d["conversion"]),
            "tax_on_conversion": round(d["tax_cost"]),
            "marginal_bracket": d.get("marginal_bracket"),
            **({"rmd": round(d["rmd"])} if d.get("rmd") else {}),
        }
        for d in result.yearly_detail
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
            "investment_return": result.input.annual_growth_rate,
            "discount_rate": result.input.discount_rate,
            "planning_horizon_age": result.input.planning_horizon_age,
            "retirement_spending": result.input.default_drawdown or "4% rule",
            "retirement_income": result.input.retirement_income,
            "state": result.input.state or "federal only",
            "retirement_state": result.input.retirement_state
            or result.input.state
            or "federal only",
        },
    }
    for key in ("rmd_summary", "irmaa_summary", "aca_summary"):
        value = getattr(trace, key)
        if value:
            summary["reasoning"][key] = value
    if result.total_subsidy_lost:
        summary["aca_total_subsidy_lost"] = round(result.total_subsidy_lost)
    return summary


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
            "current": round(base.estimated_lifetime_tax_savings),
            "what_if": round(variant.estimated_lifetime_tax_savings),
            "difference": round(
                variant.estimated_lifetime_tax_savings - base.estimated_lifetime_tax_savings
            ),
        },
        "total_conversion": {
            "current": round(base.total_conversion),
            "what_if": round(variant.total_conversion),
        },
        "total_tax_on_conversions": {
            "current": round(base.total_tax_on_conversions),
            "what_if": round(variant.total_tax_on_conversions),
        },
        "conversions_by_year": [
            {
                "year": y,
                "current": round(by_year_base.get(y, 0)),
                "what_if": round(by_year_variant.get(y, 0)),
            }
            for y in years
        ],
        "what_if_reasoning": variant.reasoning_trace.summary_points,
    }


# --------------------------------------------------------------------------
# Reference data
# --------------------------------------------------------------------------


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
