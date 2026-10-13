"""Remote MCP server at /mcp (streamable HTTP), and the single tool surface.

These are the Roth conversion tools for every client: Claude connectors, ChatGPT
apps, IDE agents, and this product's own web assistant, which connects to this
server as an MCP client (see ``app.agent.toolbox``). Tools are stateless: each
call carries the full scenario, built with the same draft rules as the
calculator form, and returns the normalized ``scenario`` to pass to the next call.

A client that renders results itself (the web app) can ask for the full engine
output by sending ``{"lucerna/ui": true}`` in the request ``_meta``. It comes back
in the result ``_meta`` under ``lucerna/results``, outside what a model sees.
"""

from __future__ import annotations

import hmac
import json
import os
from pathlib import Path
from typing import Annotated, Any

import anyio
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, Icon, TextContent, ToolAnnotations
from pydantic import Field
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.agent.limits import UsageLimiter
from app.engine.types import FilingStatus, OptimizationResult, ScenarioInput
from app.tools import core
from app.tools.draft import ScenarioDraft, current_year
from app.tools.links import full_results_url
from app.tools.models import MethodologyTopic, ScenarioUpdate
from app.tools.views import VIEW_META_KEY, result_view

INSTRUCTIONS = """Roth Conversions Optimizer runs a deterministic multi-year optimizer that finds the Roth \
conversion schedule with the highest after-tax wealth for a scenario, using 2026 federal and \
state brackets, RMDs, IRMAA and ACA subsidies. Results are educational scenario analysis, not \
financial advice: present them as "the analysis shows" and as trade-offs, never as \
instructions. Quote numbers only from tool results. Required inputs: age, filing status, \
current gross income, traditional IRA/401(k) balance and the age withdrawals begin \
(retirement_age). Ask the user for any that are missing instead of guessing. Tools are \
stateless: pass the `scenario` returned by the previous call, with any new values merged in. \
Confirm the values with the user before analyze_roth_conversions. In hosts that show this \
server's UI, scenario, result and what-if cards appear on their own: don't repeat their \
numbers as a table. A card button may send "Looks right. Run the numbers." (run the \
analysis) or ask to use a what-if as the scenario (call record_scenario with that \
comparison's what_if_scenario). Results include full_results_url, a link to the full \
interactive analysis of that scenario on the website; share it when the user wants more \
detail."""

UI_META_KEY = "lucerna/ui"
RESULTS_META_KEY = "lucerna/results"

_READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False, idempotentHint=True)

# --------------------------------------------------------------------------
# MCP Apps (io.modelcontextprotocol/ui): this server owns its UI. Views are
# prebuilt single-file HTML bundles (source in mcp-views/, built into views/),
# served as ui:// resources. A tool links to its View with _meta.ui.resourceUri;
# hosts that support MCP Apps render the tool's structuredContent with it, and
# everyone else gets the text content.
# --------------------------------------------------------------------------

APP_MIME_TYPE = "text/html;profile=mcp-app"
VIEWS_DIR = Path(__file__).resolve().parent / "views"
RESULT_CARD_URI = "ui://roth-conversions/result-card.html"
SCENARIO_SUMMARY_URI = "ui://roth-conversions/scenario-summary.html"
SCENARIO_COMPARE_URI = "ui://roth-conversions/scenario-compare.html"

# Views served as ui:// resources: (uri, file, name, title, description).
VIEWS = [
    (
        RESULT_CARD_URI,
        "result-card.html",
        "result_card",
        "Roth conversion result",
        "Estimated lifetime tax savings and a chart of how the conversions fill the tax "
        "brackets each year.",
    ),
    (
        SCENARIO_SUMMARY_URI,
        "scenario-summary.html",
        "scenario_summary",
        "Your scenario",
        "The scenario as recorded, for the user to check before running the analysis.",
    ),
    (
        SCENARIO_COMPARE_URI,
        "scenario-compare.html",
        "scenario_compare",
        "What-if comparison",
        "Estimated lifetime tax savings and conversions by year, current scenario vs. a what-if.",
    ),
]

# External origins the Views load from (fonts only). Everything else stays blocked.
VIEW_CSP = {
    "resourceDomains": ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
}


def _view_meta() -> dict:
    return {"ui": {"csp": VIEW_CSP, "prefersBorder": False}}


def _tool_ui(resource_uri: str) -> dict:
    return {"ui": {"resourceUri": resource_uri, "visibility": ["model", "app"]}}


WEBSITE_URL = "https://rothconversionsoptimizer.com"

# Shown next to the server name in connector lists. Served by the web app (frontend/public).
ICONS = [
    Icon(src=f"{WEBSITE_URL}/logo.svg", mimeType="image/svg+xml", sizes=["any"]),
    Icon(src=f"{WEBSITE_URL}/icon-512.png", mimeType="image/png", sizes=["512x512"]),
]

mcp = FastMCP(
    name="Roth Conversions Optimizer",
    instructions=INSTRUCTIONS,
    website_url=WEBSITE_URL,
    icons=ICONS,
    stateless_http=True,
    json_response=True,
    log_level="WARNING",
    # Public remote server: requests arrive with the deployment's host name.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)

ScenarioArg = Annotated[
    ScenarioUpdate,
    Field(description="The scenario: the user's values, or the `scenario` from the last result"),
]


def _wants_ui(ctx: Context | None) -> bool:
    if ctx is None:
        return False
    try:
        meta = ctx.request_context.meta
    except (AttributeError, LookupError, ValueError):
        return False
    extra = (getattr(meta, "model_extra", None) or {}) if meta is not None else {}
    return bool(extra.get(UI_META_KEY))


def _result(
    data: dict[str, Any], *, error: bool = False, meta: dict | None = None
) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(data, separators=(",", ":")))],
        structuredContent=data,
        isError=error,
        _meta=meta,
    )


def _error(message: str, **extra: Any) -> CallToolResult:
    return _result({"error": message, **extra}, error=True)


def _ui_results(entries: list[tuple[str, str, ScenarioInput, OptimizationResult]]) -> dict:
    return {
        RESULTS_META_KEY: [
            {"result_id": rid, "label": label, "result": result.model_dump(mode="json")}
            for rid, label, _scenario, result in entries
        ]
    }


def _ready_or_error(draft: ScenarioDraft) -> CallToolResult | None:
    described = core.describe_draft(draft, current_year())
    if described["ready_to_run"]:
        return None
    return _error(
        "The scenario is incomplete. Ask the user for the missing values.",
        missing_required=described["missing_required"],
        problems=described["problems"],
        scenario=described["scenario"],
    )


@mcp.tool(
    title="Record a scenario",
    annotations=_READ_ONLY,
    meta=_tool_ui(SCENARIO_SUMMARY_URI),
    description=(
        "Check and normalize a scenario as the user describes it (age, filing status, income, "
        "balances, retirement age, state, assumptions, per-year income changes). Include only "
        "values the user stated; never guess. Returns the normalized `scenario` to pass to later "
        "calls, the projected income timeline, and which required values are still missing."
    ),
)
async def record_scenario(scenario: ScenarioArg) -> CallToolResult:
    try:
        draft = core.draft_from_scenario(scenario, current_year())
    except core.ToolError as err:
        return _error(str(err))
    return _result(core.describe_draft(draft, current_year()))


@mcp.tool(
    title="Analyze Roth conversions",
    annotations=_READ_ONLY,
    meta=_tool_ui(RESULT_CARD_URI),
    description=(
        "Run the optimizer: find the Roth conversion schedule with the highest estimated lifetime "
        "tax savings for a complete scenario. Only call after the user confirmed the scenario's "
        "values or asked to run the numbers. Returns savings in today's dollars, the conversion "
        "and tax for each year, alternatives (no conversion, full conversion), the engine's "
        "reasoning, and a result_id."
    ),
)
async def analyze_roth_conversions(
    scenario: ScenarioArg,
    user_confirmed: Annotated[
        bool,
        Field(description="True only when the user confirmed the scenario or asked to run it"),
    ],
    ctx: Context | None = None,
) -> CallToolResult:
    if not user_confirmed:
        return _error("Confirm the scenario's values with the user before running the analysis.")
    try:
        draft = core.draft_from_scenario(scenario, current_year())
        if incomplete := _ready_or_error(draft):
            return incomplete
        scenario_input, result = await anyio.to_thread.run_sync(core.run_draft, draft)
    except core.ToolError as err:
        return _error(str(err))
    result_id = core.result_id_for(scenario_input)
    summary = core.summarize_result(result, result_id)
    summary["scenario"] = core.scenario_from_draft(draft, current_year())
    summary["full_results_url"] = full_results_url(summary["scenario"], result_id)
    # Chart series for the View travel in _meta, which hosts don't show the model.
    meta = {VIEW_META_KEY: result_view(result)}
    if _wants_ui(ctx):
        meta |= _ui_results([(result_id, "Your scenario", scenario_input, result)])
    return _result(summary, meta=meta)


@mcp.tool(
    title="Compare Roth conversion scenarios",
    annotations=_READ_ONLY,
    meta=_tool_ui(SCENARIO_COMPARE_URI),
    description=(
        "Answer a what-if: run the scenario and a changed copy (a different retirement age, "
        "income, spending or return) and return how the conversion schedule and estimated "
        "lifetime tax savings change. Does not change the scenario; `what_if_scenario` holds the "
        "changed version if the user wants to adopt it."
    ),
)
async def compare_roth_scenarios(
    scenario: ScenarioArg,
    changes: Annotated[
        ScenarioUpdate, Field(description="Only the values that differ in the what-if")
    ],
    label: Annotated[
        str,
        Field(min_length=1, max_length=60, description="Short name, e.g. 'Retire at 60'"),
    ] = "What-if",
    ctx: Context | None = None,
) -> CallToolResult:
    year = current_year()
    try:
        base_draft = core.draft_from_scenario(scenario, year)
        if incomplete := _ready_or_error(base_draft):
            return incomplete
        variant_draft = core.apply_update(base_draft, changes, year)
        base_input, base = await anyio.to_thread.run_sync(core.run_draft, base_draft)
        variant_input, variant = await anyio.to_thread.run_sync(core.run_draft, variant_draft)
    except core.ToolError as err:
        return _error(str(err))
    base_id, variant_id = core.result_id_for(base_input), core.result_id_for(variant_input)
    comparison = core.compare_results(base, variant, base_id, variant_id, label)
    comparison["what_if_scenario"] = core.scenario_from_draft(variant_draft, year)
    comparison["what_if_full_results_url"] = full_results_url(
        comparison["what_if_scenario"], variant_id, label
    )
    meta = (
        _ui_results(
            [
                (base_id, "Your scenario", base_input, base),
                (variant_id, label, variant_input, variant),
            ]
        )
        if _wants_ui(ctx)
        else None
    )
    return _result(comparison, meta=meta)


@mcp.tool(
    title="Get tax brackets",
    annotations=_READ_ONLY,
    description="2026 federal (and optionally state) income tax brackets and standard deductions.",
)
async def get_tax_brackets(
    filing_status: FilingStatus,
    state: Annotated[str | None, Field(description="Optional two-letter state code")] = None,
) -> CallToolResult:
    try:
        return _result(core.tax_brackets(filing_status, state))
    except core.ToolError as err:
        return _error(str(err))


@mcp.tool(
    title="Explain the methodology",
    annotations=_READ_ONLY,
    description=(
        "How the optimizer works and the concepts behind it: the savings number, bracket "
        "filling, the conversion trade-off, multi-year allocation, assumptions and limits, "
        "Roth conversions, RMDs, ACA subsidies, IRMAA, state taxes and using the tool. Read it "
        "before answering questions about methodology or the product. The text is reference "
        "for you and is not shown to the user, so answer from it in your own words."
    ),
)
async def explain_methodology(topic: MethodologyTopic) -> CallToolResult:
    return _result(
        {
            "topic": topic.value,
            "text": core.methodology_text(topic.value),
            "shown_to_user": False,
        }
    )


def _register_resources() -> None:
    for topic in core.methodology_topics():
        topic_id = topic["id"]
        mcp.resource(
            f"methodology://{topic_id}",
            name=topic_id,
            title=topic["title"],
            description=f"Methodology: {topic['title']}",
            mime_type="text/markdown",
        )(_reader(topic_id))


def _reader(topic_id: str):
    def read() -> str:
        return core.methodology_text(topic_id)

    return read


_register_resources()


def _view_reader(filename: str):
    def read() -> str:
        return (VIEWS_DIR / filename).read_text()

    return read


def _register_views() -> None:
    for uri, filename, name, title, description in VIEWS:
        mcp.resource(
            uri,
            name=name,
            title=title,
            description=description,
            mime_type=APP_MIME_TYPE,
            meta=_view_meta(),
        )(_view_reader(filename))


_register_views()


# --------------------------------------------------------------------------
# ASGI app with a per-IP daily request limit
# --------------------------------------------------------------------------

_mcp_limiter = UsageLimiter()


# The web app's own agent can reach this server over HTTP (AGENT_MCP_URL). Its calls
# all come from the backend's IP and are already limited per user at /api/agent, so
# they carry a shared secret and skip this per-IP limit.
INTERNAL_HEADER = "x-lucerna-internal"


def internal_token() -> str:
    return os.environ.get("MCP_INTERNAL_TOKEN", "")


def _is_internal(request: Request) -> bool:
    token = internal_token()
    return bool(token) and hmac.compare_digest(request.headers.get(INTERNAL_HEADER, ""), token)


def _requests_per_ip_per_day() -> int:
    try:
        return int(os.environ.get("MCP_REQUESTS_PER_IP_PER_DAY", 300))
    except ValueError:
        return 300


class _RateLimited:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope.get("method") == "POST":
            request = Request(scope)
            if _is_internal(request):
                await self.app(scope, receive, send)
                return
            forwarded = request.headers.get("x-forwarded-for", "")
            ip = (
                forwarded.split(",")[0].strip()
                if forwarded
                else (request.client.host if request.client else "unknown")
            )
            if not _mcp_limiter.count_request(ip, _requests_per_ip_per_day()):
                response = JSONResponse(
                    {"error": "Daily request limit reached. Try again tomorrow."},
                    status_code=429,
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


def build_route() -> Route:
    """Route serving the MCP endpoint at exactly /mcp (no redirect).

    The session manager must run in the host app's lifespan.
    """
    return Route(
        "/mcp", endpoint=_RateLimited(mcp.streamable_http_app()), methods=["GET", "POST", "DELETE"]
    )
