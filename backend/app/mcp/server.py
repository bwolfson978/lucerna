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
from mcp.types import CallToolResult, TextContent, ToolAnnotations
from pydantic import Field
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.agent.limits import UsageLimiter
from app.auth.clerk import AuthError, oauth_enabled, verify_oauth_token
from app.auth.identity import USER_SCOPE_KEY, user_for_tool
from app.engine.types import FilingStatus, OptimizationResult, ScenarioInput
from app.tools import core, saved
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
detail. The user's account can keep scenarios: save_scenario only when they ask to save one, \
list_saved_scenarios when they mention a saved scenario, and open_saved_scenario to continue \
from one (confirm its values before analyzing, since it may be from an earlier year)."""

UI_META_KEY = "lucerna/ui"
RESULTS_META_KEY = "lucerna/results"

_READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False, idempotentHint=True)
# Writes to the user's own saved scenarios. Never deletes or overwrites.
_SAVES = ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
)

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
        "Estimated lifetime tax savings, the conversion schedule, and charts of bracket "
        "filling and balances for an analysis.",
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


mcp = FastMCP(
    name="Roth Conversions Optimizer",
    instructions=INSTRUCTIONS,
    website_url="https://rothconversionsoptimizer.com",
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


# --------------------------------------------------------------------------
# Saved scenarios (the user's account)
# --------------------------------------------------------------------------


def _saved_error(err: saved.SavedError) -> CallToolResult:
    return _error(str(err), code=err.code)


@mcp.tool(
    title="Save a scenario",
    annotations=_SAVES,
    description=(
        "Save the scenario to the user's account so they can come back to it here or on the "
        "website. Only call when the user asks to save. Returns the saved scenario's id and name."
    ),
)
async def save_scenario(
    scenario: ScenarioArg,
    name: Annotated[
        str | None,
        Field(
            max_length=saved.NAME_MAX,
            description="Short name the user chose, e.g. 'Retire at 60'. Omit to name it "
            "from the scenario.",
        ),
    ] = None,
    ctx: Context | None = None,
) -> CallToolResult:
    try:
        draft = core.draft_from_scenario(scenario, current_year())
        result = await saved.save(user_for_tool(ctx), draft, name)
    except saved.SavedError as err:
        return _saved_error(err)
    except core.ToolError as err:
        return _error(str(err))
    return _result({"saved": result})


@mcp.tool(
    title="List saved scenarios",
    annotations=_READ_ONLY,
    description=(
        "The user's saved scenarios, newest first: id, name, when saved and the main inputs."
    ),
)
async def list_saved_scenarios(ctx: Context | None = None) -> CallToolResult:
    try:
        scenarios = await saved.list_saved(user_for_tool(ctx))
    except saved.SavedError as err:
        return _saved_error(err)
    return _result({"saved_scenarios": scenarios})


@mcp.tool(
    title="Open a saved scenario",
    annotations=_READ_ONLY,
    description=(
        "Load one of the user's saved scenarios to continue from it. Returns its name, when it "
        "was saved, and the normalized `scenario` (projected from this year) to pass to later "
        "calls, with anything still missing."
    ),
)
async def open_saved_scenario(
    scenario_id: Annotated[str, Field(description="An id from list_saved_scenarios")],
    ctx: Context | None = None,
) -> CallToolResult:
    year = current_year()
    try:
        row, draft = await saved.get_saved(user_for_tool(ctx), scenario_id)
    except saved.SavedError as err:
        return _saved_error(err)
    described = core.describe_draft(saved.refreshed_draft(draft, year), year)
    return _result(
        {"scenario_id": row.id, "name": row.name, "saved_at": row.updated_at.isoformat()}
        | described
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
# ASGI app: sign-in (OAuth) and a daily request limit
# --------------------------------------------------------------------------

_mcp_limiter = UsageLimiter()


# The web app's own agent can reach this server over HTTP (AGENT_MCP_URL). Its calls
# all come from the backend's IP and are already limited per user at /api/agent, so
# they carry a shared secret, skip sign-in and this limit, and name the web user they
# act for in USER_HEADER.
INTERNAL_HEADER = "x-lucerna-internal"
USER_HEADER = "x-lucerna-user"


def internal_token() -> str:
    return os.environ.get("MCP_INTERNAL_TOKEN", "")


def _is_internal(request: Request) -> bool:
    token = internal_token()
    return bool(token) and hmac.compare_digest(request.headers.get(INTERNAL_HEADER, ""), token)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _requests_per_ip_per_day() -> int:
    return _env_int("MCP_REQUESTS_PER_IP_PER_DAY", 300)


def _requests_per_user_per_day() -> int:
    return _env_int("MCP_REQUESTS_PER_USER_PER_DAY", 300)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    return (token.strip() or None) if scheme.lower() == "bearer" else None


def _unauthorized(request: Request, error: str | None) -> JSONResponse:
    """401 that points MCP clients at the protected resource metadata (RFC 9728), which
    names Clerk as the authorization server."""
    from app.mcp.oauth import resource_metadata_url

    challenge = f'Bearer resource_metadata="{resource_metadata_url(request)}"'
    if error:
        challenge += f', error="{error}"'
    return JSONResponse(
        {"error": error or "unauthorized", "error_description": "Sign in to use this server."},
        status_code=401,
        headers={"WWW-Authenticate": challenge},
    )


class _Guard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if _is_internal(request):
            scope[USER_SCOPE_KEY] = request.headers.get(USER_HEADER) or None
            await self.app(scope, receive, send)
            return

        user_id = None
        if oauth_enabled():
            token = _bearer_token(request)
            if token is None:
                await _unauthorized(request, None)(scope, receive, send)
                return
            try:
                user_id = (await verify_oauth_token(token)).user_id
            except AuthError:
                await _unauthorized(request, "invalid_token")(scope, receive, send)
                return
        scope[USER_SCOPE_KEY] = user_id

        if scope.get("method") == "POST":
            key, limit = (
                (f"user:{user_id}", _requests_per_user_per_day())
                if user_id
                else (_client_ip(request), _requests_per_ip_per_day())
            )
            if not _mcp_limiter.count_request(key, limit):
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
        "/mcp", endpoint=_Guard(mcp.streamable_http_app()), methods=["GET", "POST", "DELETE"]
    )
