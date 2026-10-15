"""The web assistant's tools, served by this product's own MCP server.

The agent loop is an MCP client of ``app.mcp.server``: it lists the server's tools,
sends the model's tool calls through the MCP protocol, and gets back exactly what a
Claude connector or ChatGPT app would get. By default it connects in process (an
in-memory MCP transport, no network hop); set ``AGENT_MCP_URL`` to go over
streamable HTTP to a running ``/mcp`` endpoint instead.

The web app is also an MCP Apps host. When a tool declares a View
(``_meta.ui.resourceUri``), its result is sent to the browser as an ``mcp_app`` part;
the browser fetches the View with ``resources/read`` (via /api/mcp-apps/resource),
mounts it in a sandbox on a separate origin and passes it the tool input and result.

Web-only pieces that stay out of the MCP server:
- the ``show`` tool, which asks the browser to render a native card or chart, and
- full engine results for the first-party results page, requested with ``_meta`` on
  each call and turned into browser events here (never sent to Views or models).
"""

from __future__ import annotations

import base64
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from mcp import ClientSession
from mcp.shared.exceptions import McpError
from mcp.types import CallToolResult
from pydantic import ValidationError

from app.config import settings
from app.mcp.auth import ACCOUNT_TOOLS
from app.mcp.server import APP_MIME_TYPE, RESULTS_META_KEY, UI_META_KEY
from app.tools import core
from app.tools.draft import ScenarioDraft
from app.tools.models import DisplayKind, ScenarioUpdate, ShowArgs

logger = logging.getLogger(__name__)

STATUS = {
    "prepare_scenario": "Updating your scenario",
    "analyze_roth_conversions": "Running the optimizer",
    "compare_roth_scenarios": "Comparing scenarios",
    "get_tax_brackets": "Looking up tax brackets",
    "explain_methodology": "Checking the methodology",
    "show": "Preparing a chart",
}

# Tools whose View this host doesn't mount because it has a richer first-party
# equivalent: the scenario summary here edits the live draft and syncs with the form,
# and is shown with `show` once the scenario is complete. Both use the same shared
# component (ui/src/ScenarioSummary.tsx), so they look the same.
RENDERED_NATIVELY = {"prepare_scenario"}

SHOW_TOOL = {
    "name": "show",
    "description": (
        "Display something in the conversation: the scenario summary for the user to confirm "
        "(after prepare_scenario reports nothing missing), a balance comparison for a "
        "result, or tappable follow-up questions. Numbers in these displays "
        "come from the engine. Displays appear in the order you produce them, so write your "
        "answer to the user as text first, in the same response, then call show. A display "
        "never replaces the written answer."
    ),
    "input_schema": None,  # filled from ShowArgs below
}


@dataclass
class ToolContext:
    """Per-turn state shared by tool calls: the browser's scenario and what to send it."""

    draft: ScenarioDraft
    start_year: int
    # Events for the browser, in order.
    events: list[dict] = field(default_factory=list)
    # Whether any reply text has reached the user this turn (set by the loop).
    wrote_text: bool = False

    def emit(self, event_type: str, **payload: Any) -> None:
        self.events.append({"type": event_type, **payload})


class McpToolbox:
    """An MCP client session plus the host-side rules for using it.

    Host duties from the MCP Apps spec live here: only tools whose visibility
    includes "model" reach the model; only tools whose visibility includes "app"
    can be called from a View; tools with ``_meta.ui.resourceUri`` are rendered with
    that View.
    """

    def __init__(self, session: ClientSession):
        self._session = session
        self.definitions: list[dict] = []
        self._visibility: dict[str, list[str]] = {}
        # Tool name -> ui:// resource URI of the View that renders its results.
        self.ui_tools: dict[str, str] = {}

    async def load(self) -> None:
        listed = await self._session.list_tools()
        self.definitions = []
        for tool in listed.tools:
            # The website saves scenarios itself; account tools are for other clients.
            if tool.name in ACCOUNT_TOOLS:
                continue
            meta = tool.meta or {}
            ui = meta.get("ui") if isinstance(meta.get("ui"), dict) else {}
            self._visibility[tool.name] = list(ui.get("visibility") or ["model", "app"])
            resource_uri = ui.get("resourceUri") or meta.get("ui/resourceUri")
            if isinstance(resource_uri, str) and resource_uri.startswith("ui://"):
                self.ui_tools[tool.name] = resource_uri
            if "model" in self._visibility[tool.name]:
                self.definitions.append(
                    {
                        "name": tool.name,
                        "description": tool.description or "",
                        "input_schema": clean_schema(tool.inputSchema),
                    }
                )
        self.definitions.append(
            {**SHOW_TOOL, "input_schema": clean_schema(ShowArgs.model_json_schema())}
        )

    def visible_to(self, name: str, audience: str) -> bool:
        return audience in self._visibility.get(name, [])

    async def call(self, name: str, raw_input: object, ctx: ToolContext) -> tuple[dict, bool]:
        """Run the model's tool call. Returns (content for the model, is_error)."""
        arguments = raw_input if isinstance(raw_input, dict) else {}
        if name == "show":
            return _show(arguments, ctx)
        if not self.visible_to(name, "model"):
            return {"error": f"Unknown tool '{name}'."}, True
        result = await self._session.call_tool(name, arguments, meta={UI_META_KEY: True})
        if not result.isError:
            _emit_ui_events(name, _structured(result), result, ctx)
            resource_uri = self.ui_tools.get(name)
            if resource_uri and name not in RENDERED_NATIVELY:
                ctx.emit(
                    "part",
                    part={
                        "kind": "mcp_app",
                        "resource_uri": resource_uri,
                        "tool_name": name,
                        "tool_input": arguments,
                        "tool_result": view_result(result),
                    },
                )
        return _model_content(result), bool(result.isError)

    async def call_from_app(self, name: str, arguments: dict) -> dict:
        """A View's tools/call, brokered by the host. Only app-visible tools."""
        if not self.visible_to(name, "app"):
            raise PermissionError(f"Tool '{name}' is not available to apps.")
        result = await self._session.call_tool(name, arguments)
        return view_result(result)

    async def read_ui_resource(self, uri: str) -> dict:
        """resources/read for a View, as the host needs it."""
        if not uri.startswith("ui://"):
            raise ValueError("Not a UI resource.")
        try:
            read = await self._session.read_resource(uri)
        except McpError as err:
            raise ValueError(str(err)) from err
        if len(read.contents) != 1:
            raise ValueError("Unexpected resource contents.")
        content = read.contents[0]
        if content.mimeType != APP_MIME_TYPE:
            raise ValueError(f"Unsupported UI resource type: {content.mimeType}")
        html = getattr(content, "text", None)
        if html is None:
            html = base64.b64decode(getattr(content, "blob", "") or "").decode()
        ui = (content.meta or {}).get("ui") or {}
        return {
            "uri": uri,
            "mimeType": content.mimeType,
            "html": html,
            "csp": ui.get("csp") or {},
            "permissions": ui.get("permissions") or {},
            "prefersBorder": ui.get("prefersBorder"),
        }


def view_result(result: CallToolResult) -> dict:
    """A tool result as a View receives it: content, structuredContent and _meta, minus
    the full-result payloads this host requested for its own pages."""
    data = result.model_dump(mode="json", by_alias=True, exclude_none=True)
    meta = {k: v for k, v in (data.get("_meta") or {}).items() if k != RESULTS_META_KEY}
    if meta:
        data["_meta"] = meta
    else:
        data.pop("_meta", None)
    return data


_warned: set[str] = set()


def _warn_once(message: str) -> None:
    if message not in _warned:
        _warned.add(message)
        logger.warning(message)


@asynccontextmanager
async def open_toolbox() -> AsyncIterator[McpToolbox]:
    """Connect to the MCP server (in process, or over HTTP when AGENT_MCP_URL is set)."""
    url = settings().agent_mcp_url
    if url:
        from mcp.client.streamable_http import streamable_http_client
        from mcp.shared._httpx_utils import create_mcp_http_client

        from app.mcp.server import INTERNAL_HEADER, internal_token

        token = internal_token()
        if not token:
            _warn_once(
                "AGENT_MCP_URL is set without MCP_INTERNAL_TOKEN: the web assistant's tool "
                "calls count against /mcp's per-IP daily limit and will start failing. Set "
                "MCP_INTERNAL_TOKEN, or unset AGENT_MCP_URL to call the tools in process."
            )
        http_client = create_mcp_http_client(headers={INTERNAL_HEADER: token} if token else None)
        async with (
            http_client,
            streamable_http_client(url, http_client=http_client) as (read, write, _session_id),
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


def _model_content(result: CallToolResult) -> dict:
    """What the model sees: the text content (structuredContent is for Views)."""
    text = " ".join(getattr(block, "text", "") for block in result.content).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except ValueError:
        pass
    return {"error": text} if result.isError else {"text": text}


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
    if name == "prepare_scenario":
        _set_draft(data.get("scenario"), ctx)
        return

    entries = _ui_results(result)
    if name == "analyze_roth_conversions":
        _set_draft(data.get("scenario"), ctx)
        for entry in entries:
            ctx.emit("result", **entry)
        # The result card itself is the tool's MCP App View (see McpToolbox.call).
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
            extra = (
                {"draft": variant_draft.model_dump(mode="json")}
                if variant_draft is not None and entry["result_id"] == data["variant_result_id"]
                else {}
            )
            ctx.emit("result", **entry, **extra)
        # The comparison card itself is the tool's MCP App View (see McpToolbox.call).


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

    suggestions = [s.strip() for s in args.suggestions or [] if s.strip()]
    if not 1 <= len(suggestions) <= 4:
        return {"error": "Provide 1 to 4 suggestions."}, True
    ctx.emit("part", part={"kind": "suggestions", "suggestions": suggestions})
    return _shown(ctx, {"shown": "suggestions"}), False


# The model sometimes drafts its answer while thinking, shows a chart or suggestions, and
# ends the turn believing the user read the draft. Thinking is never shown, so say so.
NO_TEXT_YET = (
    "The user has not seen any text from you this turn. Anything you wrote while thinking is "
    "never shown, even if it reads like a finished reply. Your next output must be a text "
    "block with your full answer to their message (don't call show again for what is already "
    "shown, and don't mention this note to them)."
)


def _shown(ctx: ToolContext, content: dict) -> dict:
    return content if ctx.wrote_text else {**content, "note": NO_TEXT_YET}


def clean_schema(schema: Any) -> Any:
    """Drop titles so tool schemas stay compact and stable."""
    if isinstance(schema, dict):
        return {k: clean_schema(v) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [clean_schema(v) for v in schema]
    return schema
