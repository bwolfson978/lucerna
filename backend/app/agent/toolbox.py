"""The web assistant's tools, served by this product's own MCP server.

The agent loop is an MCP client of ``app.mcp.server``: it lists the server's tools,
sends the model's tool calls through the MCP protocol, and gets back exactly what a
Claude connector or ChatGPT app would get. By default it connects in process (an
in-memory MCP transport, no network hop); set ``AGENT_MCP_URL`` to go over
streamable HTTP to a running ``/mcp`` endpoint instead.

Two things are web-only and stay out of the MCP server:
- the ``show`` tool, which asks the browser to render a card or chart, and
- the UI payloads (full engine results), requested with ``_meta`` on each call and
  turned into browser events here.
"""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession
from mcp.types import CallToolResult
from pydantic import ValidationError

from app.mcp.server import RESULTS_META_KEY, UI_META_KEY
from app.tools import core
from app.tools.draft import ScenarioDraft
from app.tools.models import DisplayKind, ScenarioUpdate, ShowArgs

STATUS = {
    "record_scenario": "Updating your scenario",
    "analyze_roth_conversions": "Running the optimizer",
    "compare_roth_scenarios": "Comparing scenarios",
    "get_tax_brackets": "Looking up tax brackets",
    "explain_methodology": "Checking the methodology",
    "show": "Preparing a chart",
}

SHOW_TOOL = {
    "name": "show",
    "description": (
        "Display something in the conversation: the scenario summary for the user to confirm "
        "(after record_scenario reports nothing missing), a bracket-fill chart or balance "
        "comparison for a result, or tappable follow-up questions. Numbers in these displays "
        "come from the engine."
    ),
    "input_schema": None,  # filled from ShowArgs below
}


@dataclass
class ToolContext:
    """Per-turn state shared by tool calls: the browser's scenario and what to send it."""

    draft: ScenarioDraft
    start_year: int
    # Result ids the conversation already knows about (from earlier turns).
    known_result_ids: set[str] = field(default_factory=set)
    # Full results received during this turn, keyed by result id.
    results: dict[str, dict] = field(default_factory=dict)
    # Events for the browser, in order.
    events: list[dict] = field(default_factory=list)

    def emit(self, event_type: str, **payload: Any) -> None:
        self.events.append({"type": event_type, **payload})

    def has_result(self, result_id: str) -> bool:
        return result_id in self.results or result_id in self.known_result_ids


class McpToolbox:
    def __init__(self, session: ClientSession):
        self._session = session
        self.definitions: list[dict] = []
        self._remote: set[str] = set()

    async def load(self) -> None:
        listed = await self._session.list_tools()
        self.definitions = [
            {
                "name": tool.name,
                "description": tool.description or "",
                "input_schema": clean_schema(tool.inputSchema),
            }
            for tool in listed.tools
        ]
        self._remote = {tool.name for tool in listed.tools}
        self.definitions.append(
            {**SHOW_TOOL, "input_schema": clean_schema(ShowArgs.model_json_schema())}
        )

    async def call(self, name: str, raw_input: object, ctx: ToolContext) -> tuple[dict, bool]:
        """Run one tool call. Returns (content for the model, is_error)."""
        arguments = raw_input if isinstance(raw_input, dict) else {}
        if name == "show":
            return _show(arguments, ctx)
        if name not in self._remote:
            return {"error": f"Unknown tool '{name}'."}, True
        result = await self._session.call_tool(name, arguments, meta={UI_META_KEY: True})
        data = _structured(result)
        if not result.isError:
            _emit_ui_events(name, data, result, ctx)
        return data, bool(result.isError)


@asynccontextmanager
async def open_toolbox() -> AsyncIterator[McpToolbox]:
    """Connect to the MCP server (in process, or over HTTP when AGENT_MCP_URL is set)."""
    url = os.environ.get("AGENT_MCP_URL")
    if url:
        from mcp.client.streamable_http import streamable_http_client

        async with (
            streamable_http_client(url) as (read, write, _session_id),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            toolbox = McpToolbox(session)
            await toolbox.load()
            yield toolbox
        return

    from mcp.shared.memory import create_connected_server_and_client_session

    from app.mcp.server import mcp

    async with create_connected_server_and_client_session(mcp) as session:
        toolbox = McpToolbox(session)
        await toolbox.load()
        yield toolbox


# --------------------------------------------------------------------------
# MCP results -> browser events
# --------------------------------------------------------------------------


def _structured(result: CallToolResult) -> dict:
    if isinstance(result.structuredContent, dict):
        return result.structuredContent
    text = " ".join(getattr(block, "text", "") for block in result.content).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except ValueError:
        pass
    return {"error": text} if result.isError else {"text": text}


def _ui_results(result: CallToolResult) -> list[dict]:
    meta = result.meta or {}
    return meta.get(RESULTS_META_KEY) or []


def _set_draft(scenario: dict | None, ctx: ToolContext) -> ScenarioDraft | None:
    if not scenario:
        return None
    try:
        draft = core.draft_from_scenario(ScenarioUpdate.model_validate(scenario), ctx.start_year)
    except (ValidationError, core.ToolError):
        return None
    if draft != ctx.draft:
        ctx.draft = draft
        described = core.describe_draft(draft, ctx.start_year)
        ctx.emit(
            "draft", draft=draft.model_dump(mode="json"), missing=described["missing_required"]
        )
    return draft


def _emit_ui_events(name: str, data: dict, result: CallToolResult, ctx: ToolContext) -> None:
    if name == "record_scenario":
        _set_draft(data.get("scenario"), ctx)
        return

    entries = _ui_results(result)
    if name == "analyze_roth_conversions":
        _set_draft(data.get("scenario"), ctx)
        for entry in entries:
            ctx.results[entry["result_id"]] = entry["result"]
            ctx.emit("result", **entry)
        ctx.emit("part", part={"kind": "result_headline", "result_id": data["result_id"]})
        return

    if name == "compare_roth_scenarios":
        variant_draft = None
        if what_if := data.get("what_if_scenario"):
            try:
                variant_draft = core.draft_from_scenario(
                    ScenarioUpdate.model_validate(what_if), ctx.start_year
                )
            except (ValidationError, core.ToolError):
                variant_draft = None
        for entry in entries:
            ctx.results[entry["result_id"]] = entry["result"]
            extra = (
                {"draft": variant_draft.model_dump(mode="json")}
                if variant_draft is not None and entry["result_id"] == data["variant_result_id"]
                else {}
            )
            ctx.emit("result", **entry, **extra)
        ctx.emit(
            "part",
            part={
                "kind": "scenario_compare",
                "base_result_id": data["base_result_id"],
                "result_id": data["variant_result_id"],
                "label": data["label"],
            },
        )


# --------------------------------------------------------------------------
# Web-only display tool
# --------------------------------------------------------------------------


def _show(arguments: dict, ctx: ToolContext) -> tuple[dict, bool]:
    try:
        args = ShowArgs.model_validate(arguments)
    except ValidationError as err:
        details = [f"{'.'.join(map(str, e['loc'])) or 'input'}: {e['msg']}" for e in err.errors()]
        return {"error": "Invalid input", "details": details[:10]}, True

    if args.kind == DisplayKind.SCENARIO_SUMMARY:
        described = core.describe_draft(ctx.draft, ctx.start_year)
        if not described["ready_to_run"]:
            missing = described["missing_required"] + described["problems"]
            return {
                "error": "The scenario is not complete. Record the missing values first: "
                + ", ".join(missing)
            }, True
        ctx.emit(
            "part",
            part={
                "kind": "scenario_summary",
                "draft": ctx.draft.model_dump(mode="json"),
                "draft_hash": described["draft_hash"],
            },
        )
        return {"shown": "scenario_summary", "draft_hash": described["draft_hash"]}, False

    if args.kind == DisplayKind.SUGGESTIONS:
        suggestions = [s.strip() for s in args.suggestions or [] if s.strip()]
        if not 1 <= len(suggestions) <= 4:
            return {"error": "Provide 1 to 4 suggestions."}, True
        ctx.emit("part", part={"kind": "suggestions", "suggestions": suggestions})
        return {"shown": "suggestions"}, False

    if not args.result_id or not ctx.has_result(args.result_id):
        return {
            "error": f"{args.kind.value} needs a result_id from an earlier "
            "analyze_roth_conversions or compare_roth_scenarios result."
        }, True
    ctx.emit("part", part={"kind": args.kind.value, "result_id": args.result_id})
    return {"shown": args.kind.value, "result_id": args.result_id}, False


def clean_schema(schema: Any) -> Any:
    """Drop titles so tool schemas stay compact and stable."""
    if isinstance(schema, dict):
        return {k: clean_schema(v) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [clean_schema(v) for v in schema]
    return schema
