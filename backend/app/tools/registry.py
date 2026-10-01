"""Tool registry for the conversational agent.

Each tool pairs a Pydantic input model (its schema is generated, never hand
written) with a handler. Handlers read and update a per-turn ``ToolContext`` and
return compact JSON for the model. Anything the browser needs (the updated draft,
full results, charts to render) is queued on ``ctx.events`` instead of being sent
through the model, so displayed numbers always come straight from the engine.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel, ValidationError

from app.engine.types import OptimizationResult
from app.tools import core
from app.tools.draft import ScenarioDraft
from app.tools.models import (
    CompareArgs,
    DisplayKind,
    MethodologyArgs,
    OptimizeArgs,
    ShowArgs,
    TaxBracketsArgs,
    UpdateScenarioArgs,
)


@dataclass
class ToolContext:
    draft: ScenarioDraft
    start_year: int
    # Result ids the conversation already knows about (from earlier turns).
    known_result_ids: set[str] = field(default_factory=set)
    # Results computed during this turn, keyed by result id.
    results: dict[str, OptimizationResult] = field(default_factory=dict)
    # Events for the browser, in order.
    events: list[dict] = field(default_factory=list)

    def emit(self, event_type: str, **payload) -> None:
        self.events.append({"type": event_type, **payload})

    def has_result(self, result_id: str) -> bool:
        return result_id in self.results or result_id in self.known_result_ids


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_model: type[BaseModel]
    handler: Callable[[BaseModel, ToolContext], dict]
    # Short status line the UI shows while the tool runs.
    status: str

    def input_schema(self) -> dict:
        return _clean_schema(self.input_model.model_json_schema())

    def anthropic_definition(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema(),
        }


# --------------------------------------------------------------------------
# Handlers
# --------------------------------------------------------------------------


def _update_scenario(args: UpdateScenarioArgs, ctx: ToolContext) -> dict:
    ctx.draft = core.apply_update(ctx.draft, args, ctx.start_year)
    described = core.describe_draft(ctx.draft)
    ctx.emit(
        "draft", draft=ctx.draft.model_dump(mode="json"), missing=described["missing_required"]
    )
    return described


def _optimize_scenario(args: OptimizeArgs, ctx: ToolContext) -> dict:
    if not args.user_confirmed:
        raise core.ToolError(
            "Show the scenario_summary and wait for the user to confirm before running."
        )
    scenario, result = core.run_draft(ctx.draft)
    result_id = core.result_id_for(scenario)
    ctx.results[result_id] = result
    ctx.emit("result", result_id=result_id, label="Your scenario", result=result)
    ctx.emit("part", part={"kind": "result_headline", "result_id": result_id})
    return core.summarize_result(result, result_id)


def _compare_scenarios(args: CompareArgs, ctx: ToolContext) -> dict:
    base_scenario, base = core.run_draft(ctx.draft)
    variant_draft = core.apply_update(ctx.draft, args.changes, ctx.start_year)
    variant_scenario, variant = core.run_draft(variant_draft)
    base_id = core.result_id_for(base_scenario)
    variant_id = core.result_id_for(variant_scenario)
    ctx.results[base_id] = base
    ctx.results[variant_id] = variant
    ctx.emit("result", result_id=base_id, label="Your scenario", result=base)
    ctx.emit(
        "result",
        result_id=variant_id,
        label=args.label,
        result=variant,
        draft=variant_draft.model_dump(mode="json"),
    )
    ctx.emit(
        "part",
        part={
            "kind": "scenario_compare",
            "base_result_id": base_id,
            "result_id": variant_id,
            "label": args.label,
        },
    )
    return core.compare_results(base, variant, base_id, variant_id, args.label)


def _get_tax_brackets(args: TaxBracketsArgs, ctx: ToolContext) -> dict:
    return core.tax_brackets(args.filing_status, args.state)


def _explain_methodology(args: MethodologyArgs, ctx: ToolContext) -> dict:
    return {"topic": args.topic.value, "text": core.methodology_text(args.topic.value)}


def _show(args: ShowArgs, ctx: ToolContext) -> dict:
    if args.kind == DisplayKind.SCENARIO_SUMMARY:
        described = core.describe_draft(ctx.draft)
        if not described["ready_to_run"]:
            raise core.ToolError(
                "The scenario is not complete. Still needed: "
                + ", ".join(described["missing_required"] + described["problems"])
            )
        ctx.emit(
            "part",
            part={
                "kind": "scenario_summary",
                "draft": ctx.draft.model_dump(mode="json"),
                "draft_hash": described["draft_hash"],
            },
        )
        return {"shown": "scenario_summary", "draft_hash": described["draft_hash"]}

    if args.kind == DisplayKind.SUGGESTIONS:
        suggestions = [s.strip() for s in args.suggestions or [] if s.strip()]
        if not 1 <= len(suggestions) <= 4:
            raise core.ToolError("Provide 1 to 4 suggestions.")
        ctx.emit("part", part={"kind": "suggestions", "suggestions": suggestions})
        return {"shown": "suggestions"}

    if not args.result_id or not ctx.has_result(args.result_id):
        raise core.ToolError(
            f"{args.kind.value} needs a result_id from an earlier optimize_scenario or "
            "compare_scenarios result."
        )
    ctx.emit("part", part={"kind": args.kind.value, "result_id": args.result_id})
    return {"shown": args.kind.value, "result_id": args.result_id}


# --------------------------------------------------------------------------
# Registry
# --------------------------------------------------------------------------


TOOLS: tuple[Tool, ...] = (
    Tool(
        name="update_scenario",
        description=(
            "Record scenario values the user has stated (age, filing status, income, balances, "
            "retirement age, state, assumptions, per-year income changes). Send only values the "
            "user gave or clearly confirmed; never guess. Returns the full scenario so far, "
            "which required values are still missing, and the projected income timeline."
        ),
        input_model=UpdateScenarioArgs,
        handler=_update_scenario,
        status="Updating your scenario",
    ),
    Tool(
        name="optimize_scenario",
        description=(
            "Run the Roth conversion optimizer on the current scenario. Only call after the "
            "user confirmed the scenario summary or asked to run the numbers. Returns the "
            "result_id, estimated lifetime tax savings, the conversion schedule by year and the "
            "engine's reasoning. The headline result card is shown to the user automatically."
        ),
        input_model=OptimizeArgs,
        handler=_optimize_scenario,
        status="Running the optimizer",
    ),
    Tool(
        name="compare_scenarios",
        description=(
            "Answer a what-if question by running the current scenario and a changed copy, "
            "then returning the differences. Does not change the user's scenario; the user can "
            "apply the what-if from the comparison card. The comparison card is shown "
            "automatically."
        ),
        input_model=CompareArgs,
        handler=_compare_scenarios,
        status="Comparing scenarios",
    ),
    Tool(
        name="get_tax_brackets",
        description="Look up 2026 federal (and optionally state) income tax brackets and standard deductions.",
        input_model=TaxBracketsArgs,
        handler=_get_tax_brackets,
        status="Looking up tax brackets",
    ),
    Tool(
        name="explain_methodology",
        description=(
            "Read how this tool works: the savings number, bracket filling, the conversion "
            "trade-off, multi-year allocation, assumptions and limits, what a Roth conversion "
            "is, how the optimizer works, RMDs, ACA subsidies, IRMAA, state taxes, and how to "
            "use this tool. Use it before answering questions about methodology or the product."
        ),
        input_model=MethodologyArgs,
        handler=_explain_methodology,
        status="Checking the methodology",
    ),
    Tool(
        name="show",
        description=(
            "Display something in the conversation: the scenario summary for the user to "
            "confirm, a bracket-fill chart or balance comparison for a result, or tappable "
            "follow-up questions. Numbers in these displays come from the engine."
        ),
        input_model=ShowArgs,
        handler=_show,
        status="Preparing a chart",
    ),
)

TOOLS_BY_NAME: dict[str, Tool] = {tool.name: tool for tool in TOOLS}


def anthropic_tools() -> list[dict]:
    return [tool.anthropic_definition() for tool in TOOLS]


def run_tool(name: str, raw_input: object, ctx: ToolContext) -> tuple[dict, bool]:
    """Validate and run a tool call. Returns (content, is_error)."""
    tool = TOOLS_BY_NAME.get(name)
    if tool is None:
        return {"error": f"Unknown tool '{name}'."}, True
    try:
        args = tool.input_model.model_validate(raw_input if isinstance(raw_input, dict) else {})
    except ValidationError as err:
        return {"error": "Invalid input", "details": _validation_messages(err)}, True
    try:
        return tool.handler(args, ctx), False
    except core.ToolError as err:
        return {"error": str(err)}, True


def _validation_messages(err: ValidationError) -> list[str]:
    return [
        f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}" for e in err.errors()[:10]
    ]


def _clean_schema(schema: dict) -> dict:
    """Drop Pydantic titles so the schema stays compact and stable."""
    if isinstance(schema, dict):
        return {k: _clean_schema(v) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [_clean_schema(v) for v in schema]
    return schema
