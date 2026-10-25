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

import functools
import hmac
import json
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlencode

import anyio
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, Icon, TextContent, ToolAnnotations
from pydantic import Field
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.config import settings
from app.db import scenarios as saved_store
from app.engine.types import FilingStatus, OptimizationResult, ScenarioInput
from app.mcp import analytics
from app.mcp import auth as mcp_auth
from app.mcp.limits import (
    AnalysisLimiter,
    LimitReached,
    client_ip,
    current_caller,
    is_signed_in,
    next_reset,
)
from app.tools import core, feedback
from app.tools.draft import ScenarioDraft, current_year
from app.tools.links import full_results_url, site_url, tagged
from app.tools.models import MethodologyTopic, ScenarioUpdate
from app.tools.views import VIEW_META_KEY, result_view

INSTRUCTIONS = """Roth Conversions Optimizer runs a deterministic multi-year optimizer that finds the Roth \
conversion schedule with the highest after-tax wealth for a scenario, using 2026 federal and \
state brackets, RMDs, IRMAA and ACA subsidies. Results are educational scenario analysis, not \
financial advice: present them as "the analysis shows" and as trade-offs, never as \
instructions. Quote numbers only from tool results. Required inputs: the month and year the user was \
born (and their spouse's when filing jointly; if the user gives only an age, ask for them: some \
parts of the analysis depend on the month and year you were born), filing status, \
current gross income, traditional IRA/401(k) balance and the age withdrawals begin \
(retirement_age). Ask the user for any that are missing instead of guessing. Tools are \
stateless: pass the `scenario` returned by the previous call, with any new values merged in. \
Confirm the values with the user before analyze_roth_conversions. In hosts that show this \
server's UI, scenario, result and what-if cards appear on their own: don't repeat their \
numbers as a table. A card button may send "Looks right. Run the numbers." (run the \
analysis) or ask to use a what-if as the scenario (call prepare_scenario with that \
comparison's what_if_scenario). Results include full_results_url, a link to the full \
interactive analysis of that scenario on the website; share it when the user wants more \
detail. Users can keep scenarios in an account: call save_scenario when they ask to \
save one (the first call asks them to sign in), and list_saved_scenarios and \
open_saved_scenario to pick one up later. Saving is optional: mention it at most once, \
after an analysis, and never ask them to sign in for anything else. When the user wants to \
share feedback or says something is broken or wrong, offer send_feedback or report_problem, \
show them what will be sent, and send it only once they agree."""

UI_META_KEY = "lucerna/ui"
RESULTS_META_KEY = "lucerna/results"

# Directory reviews (ChatGPT in particular) want every hint as an explicit boolean.
_READ_ONLY = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, openWorldHint=False, idempotentHint=True
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


# ChatGPT reads each tool's auth needs from securitySchemes (other clients ignore it).
_NO_AUTH = {"securitySchemes": [{"type": "noauth"}]}


def _account_meta() -> dict:
    return {"securitySchemes": [{"type": "oauth2", "scopes": mcp_auth.auth_scopes()}]}


def _tool_ui(resource_uri: str) -> dict:
    return {"ui": {"resourceUri": resource_uri, "visibility": ["model", "app"]}, **_NO_AUTH}


# The website (SITE_URL), shown with the connector and serving its icons.
WEBSITE_URL = settings().site_origin

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


# --------------------------------------------------------------------------
# Analytics: every tool call sends one PostHog event (see app.mcp.analytics), and
# links handed to a chat app carry utm tags naming it.
# --------------------------------------------------------------------------

# Fresh optimizer runs in the current tool call (cached results don't count).
_fresh_runs: ContextVar[int] = ContextVar("fresh_runs", default=0)


def _request_meta() -> dict[str, Any]:
    try:
        meta = mcp.get_context().request_context.meta
    except (AttributeError, LookupError, ValueError):
        return {}
    return dict(getattr(meta, "model_extra", None) or {}) if meta is not None else {}


def _client() -> str:
    return analytics.resolve_client(_request_meta())


def _link(url: str) -> str:
    return tagged(url, analytics.link_source(_client()))


def _results_url(scenario: dict, result_id: str, label: str | None = None) -> str:
    return full_results_url(scenario, result_id, label, analytics.link_source(_client()))


def _tracked(fn):
    """Send an analytics event after each call of a tool. Applied under @mcp.tool."""

    @functools.wraps(fn)
    async def call(*args, **kwargs):
        start = time.monotonic()
        fresh = _fresh_runs.set(0)
        properties: dict[str, Any] = {}
        try:
            result = await fn(*args, **kwargs)
        except Exception:
            properties["is_error"] = True
            properties["error"] = "exception"
            raise
        else:
            data = result.structuredContent or {}
            properties["is_error"] = bool(result.isError)
            if result.isError:
                properties["error"] = data.get("limit_reached") or (
                    "incomplete" if "missing_required" in data else "other"
                )
            return result
        finally:
            properties["fresh_analyses"] = _fresh_runs.get()
            properties["duration_ms"] = round((time.monotonic() - start) * 1000)
            _fresh_runs.reset(fresh)
            meta = _request_meta()
            analytics.tool_called(
                fn.__name__,
                client=analytics.resolve_client(meta),
                user_id=_signed_in_user(),
                request_meta=meta,
                properties=properties,
            )

    return call


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
        **(
            {"why_birth_date": described["why_birth_date"]} if "why_birth_date" in described else {}
        ),
        problems=described["problems"],
        scenario=described["scenario"],
    )


_analysis_limiter = AnalysisLimiter()

_LIMIT_MESSAGES = {
    "daily_limit": (
        "This connection has reached today's limit of {limit} analyses. It resets at "
        "{reset}. Until then the user can run this scenario on the website at "
        "full_results_url, which has no daily limit."
    ),
    "capacity": (
        "The optimizer has reached its daily capacity for anonymous use. It resets at "
        "{reset}. Until then the user can run this scenario on the website at "
        "full_results_url."
    ),
    "busy": (
        "The optimizer is busy with other analyses right now. Try again in a minute, or "
        "the user can run this scenario on the website at full_results_url."
    ),
}


_SIGN_IN_NOTE = " Signing in to Roth Conversions Optimizer raises the daily limit."


def _limit_error(err: LimitReached, draft: ScenarioDraft) -> CallToolResult:
    reset = next_reset()
    message = _LIMIT_MESSAGES[err.code].format(limit=err.limit, reset=reset.strftime("%H:%M UTC"))
    if (
        err.code == "daily_limit"
        and mcp_auth.auth_issuer()
        and not is_signed_in(current_caller.get())
    ):
        message += _SIGN_IN_NOTE
    scenario = core.scenario_from_draft(draft, current_year())
    url = _results_url(scenario, core.result_id_for(core.scenario_input(draft)))
    return _error(
        message,
        limit_reached=err.code,
        resets_at=reset.isoformat() if err.code != "busy" else None,
        full_results_url=url,
        website=_link(site_url()),
    )


async def _run_drafts(
    drafts: list[ScenarioDraft],
) -> list[tuple[ScenarioInput, OptimizationResult]]:
    """Run each draft through the optimizer. Only results not already cached count
    against the caller's limits (LimitReached when one is hit). Cached results are
    taken up front, so everything computed below has been charged and holds a slot."""
    inputs = [core.scenario_input(d) for d in drafts]
    results: dict[str, OptimizationResult] = {}
    fresh: dict[str, ScenarioInput] = {}
    for scenario in inputs:
        key = core.scenario_key(scenario)
        if key in results or key in fresh:
            continue
        if (cached := core.cached_result(scenario)) is not None:
            results[key] = cached
        else:
            fresh[key] = scenario
    async with _analysis_limiter.admit(current_caller.get(), len(fresh)):
        _fresh_runs.set(_fresh_runs.get() + len(fresh))
        for key, scenario in fresh.items():
            results[key] = await anyio.to_thread.run_sync(core.run_optimization, scenario)
    return [(i, results[core.scenario_key(i)]) for i in inputs]


@mcp.tool(
    title="Prepare a scenario",
    annotations=_READ_ONLY,
    meta=_tool_ui(SCENARIO_SUMMARY_URI),
    description=(
        "Check and normalize a scenario as the user describes it (birth month and year, filing "
        "status, income, "
        "balances, retirement age, state, assumptions, per-year income changes). Include only "
        "values the user stated; never guess. Returns the normalized `scenario` to pass to later "
        "calls, the projected income timeline, and which required values are still missing."
    ),
)
@_tracked
async def prepare_scenario(scenario: ScenarioArg) -> CallToolResult:
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
        "values or asked to run the numbers. Returns savings and yearly amounts in today's "
        "dollars, the conversion and tax for each year, alternatives (no conversion, full conversion), the engine's "
        "reasoning, and a result_id."
    ),
)
@_tracked
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
        [(scenario_input, result)] = await _run_drafts([draft])
    except core.ToolError as err:
        return _error(str(err))
    except LimitReached as err:
        return _limit_error(err, draft)
    result_id = core.result_id_for(scenario_input)
    summary = core.summarize_result(result, result_id)
    summary["scenario"] = core.scenario_from_draft(draft, current_year())
    summary["full_results_url"] = _results_url(summary["scenario"], result_id)
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
@_tracked
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
        (base_input, base), (variant_input, variant) = await _run_drafts(
            [base_draft, variant_draft]
        )
    except core.ToolError as err:
        return _error(str(err))
    except LimitReached as err:
        return _limit_error(err, variant_draft)
    base_id, variant_id = core.result_id_for(base_input), core.result_id_for(variant_input)
    comparison = core.compare_results(base, variant, base_id, variant_id, label)
    comparison["what_if_scenario"] = core.scenario_from_draft(variant_draft, year)
    comparison["what_if_full_results_url"] = _results_url(
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
    meta=_NO_AUTH,
    description="2026 federal (and optionally state) income tax brackets and standard deductions.",
)
@_tracked
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
    meta=_NO_AUTH,
    description=(
        "How the optimizer works and the concepts behind it: the savings number, bracket "
        "filling, the conversion trade-off, multi-year allocation, assumptions and limits, "
        "Roth conversions, RMDs, ACA subsidies, IRMAA, state taxes and using the tool. Returns "
        "reference text on the chosen topic. The text is not displayed to the user."
    ),
)
@_tracked
async def explain_methodology(topic: MethodologyTopic) -> CallToolResult:
    return _result(
        {
            "topic": topic.value,
            "text": core.methodology_text(topic.value),
            "shown_to_user": False,
        }
    )


# --------------------------------------------------------------------------
# Feedback: open to everyone, sent to PostHog Surveys (app.tools.feedback). They write
# to the developer's inbox, not to anything the user owns, so they aren't destructive.
# --------------------------------------------------------------------------

_FEEDBACK = ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, openWorldHint=False, idempotentHint=False
)

_CONSENT = (
    "Only call when the user asks to send it. First show the user the exact text you'll "
    "send and get their OK. Don't add their financial details or anything they didn't ask "
    "to include."
)

EmailArg = Annotated[
    str | None,
    Field(
        max_length=feedback.MAX_EMAIL,
        description="The user's email, only if they want a reply and gave it to you",
    ),
]


def _send(kind: feedback.FeedbackKind, message: str, **kwargs: Any) -> CallToolResult:
    user_id = _signed_in_user()
    try:
        feedback.submit(
            kind,
            message,
            source=_client(),
            caller=current_caller.get(),
            distinct_id=user_id,
            **kwargs,
        )
    except feedback.FeedbackLimitReached:
        return _error(
            "Too many messages have been sent today. The user can try again tomorrow or use "
            "the form on the website.",
            website=_link(site_url()),
        )
    except feedback.FeedbackError as err:
        return _error(str(err))
    note = (
        "Sent to the developer, who may reply by email."
        if kwargs.get("email")
        else "Sent to the developer. No email was given, so there won't be a reply."
    )
    return _result({"sent": True, "note": note})


@mcp.tool(
    title="Send feedback",
    annotations=_FEEDBACK,
    meta=_NO_AUTH,
    description=(
        "Send the user's feedback, ideas or questions about Roth Conversions Optimizer to "
        f"its developer. {_CONSENT}"
    ),
)
@_tracked
async def send_feedback(
    message: Annotated[
        str,
        Field(max_length=feedback.MAX_MESSAGE, description="The feedback, in the user's words"),
    ],
    email: EmailArg = None,
) -> CallToolResult:
    return _send(feedback.FeedbackKind.FEEDBACK, message, email=email)


@mcp.tool(
    title="Report a problem",
    annotations=_FEEDBACK,
    meta=_NO_AUTH,
    description=(
        "Report something broken or wrong in Roth Conversions Optimizer (an error, a result "
        f"that looks wrong, a card that didn't show) to its developer. {_CONSENT} Include "
        "the tool that misbehaved and what it returned when that helps."
    ),
)
@_tracked
async def report_problem(
    what_happened: Annotated[
        str,
        Field(max_length=feedback.MAX_MESSAGE, description="What went wrong"),
    ],
    expected: Annotated[
        str | None,
        Field(max_length=feedback.MAX_MESSAGE, description="What the user expected instead"),
    ] = None,
    results_url: Annotated[
        str | None,
        Field(
            max_length=feedback.MAX_CONTEXT,
            description="full_results_url of the analysis involved, if the user agrees",
        ),
    ] = None,
    email: EmailArg = None,
) -> CallToolResult:
    return _send(
        feedback.FeedbackKind.PROBLEM,
        what_happened,
        expected=expected,
        email=email,
        context={"results_url": results_url},
    )


# --------------------------------------------------------------------------
# Account tools: saved scenarios, shared with "My scenarios" on the website.
# Calls without a valid token never get here over HTTP (see _IdentifyCaller); the
# check below covers in-process callers and gives ChatGPT its linking hint.
# --------------------------------------------------------------------------

_ACCOUNT = ToolAnnotations(
    readOnlyHint=True, destructiveHint=False, openWorldHint=False, idempotentHint=True
)
_SAVE = ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, openWorldHint=False, idempotentHint=False
)


def _signed_in_user() -> str | None:
    caller = current_caller.get()
    return caller.removeprefix("user:") if is_signed_in(caller) else None


def _sign_in_required() -> CallToolResult:
    if mcp_auth.auth_issuer() is None:
        return _error(
            "Saving scenarios from a chat isn't available yet. The user can save it on the "
            "website from full_results_url.",
            website=_link(site_url()),
        )
    result = _error("The user needs to sign in to Roth Conversions Optimizer first.")
    result.meta = {
        "mcp/www_authenticate": [
            'Bearer error="invalid_token", error_description="Sign in to use saved scenarios"'
        ]
    }
    return result


def _storage_unavailable() -> CallToolResult:
    return _error("Saved scenarios are unavailable right now. Try again later.")


def _saved_url(saved_id: str) -> str:
    return _link(f"{site_url()}/calculator?{urlencode({'saved': saved_id})}")


@mcp.tool(
    title="Save a scenario",
    annotations=_SAVE,
    meta=_account_meta(),
    description=(
        "Save a complete scenario and its analysis to the user's Roth Conversions Optimizer "
        "account, so they can reopen it later in a chat or on the website (My scenarios). "
        "Only call when the user asks to save or keep it. With `saved_id`, the saved "
        "scenario is updated to this version; without it, a new one is saved. Needs the "
        "user to sign in; the first call asks them to."
    ),
)
@_tracked
async def save_scenario(
    scenario: ScenarioArg,
    name: Annotated[
        str | None,
        Field(max_length=80, description="Optional name, e.g. 'Retire at 60, stay in Ohio'"),
    ] = None,
    saved_id: Annotated[
        str | None,
        Field(
            description=(
                "saved_id of the scenario being worked on (from open_saved_scenario or an "
                "earlier save_scenario), to update it. Leave out to save a new scenario."
            )
        ),
    ] = None,
) -> CallToolResult:
    user_id = _signed_in_user()
    if user_id is None:
        return _sign_in_required()
    year = current_year()
    try:
        draft = core.draft_from_scenario(scenario, year)
        if incomplete := _ready_or_error(draft):
            return incomplete
        [(scenario_input, result)] = await _run_drafts([draft])
    except core.ToolError as err:
        return _error(str(err))
    except LimitReached as err:
        return _limit_error(err, draft)
    fields = {
        "name": name.strip() if name and name.strip() else None,
        "scenario": core.scenario_from_draft(draft, year),
    }
    try:
        if saved_id:
            saved = await saved_store.update(
                user_id, saved_id, scenario_input, result.model_dump(mode="json"), **fields
            )
            if saved is None:
                return _error("No saved scenario with that saved_id. Call list_saved_scenarios.")
        else:
            saved = await saved_store.save(
                user_id, scenario_input, result.model_dump(mode="json"), **fields
            )
    except saved_store.StorageUnavailable:
        return _storage_unavailable()
    saved_id, saved_name = saved
    return _result(
        {
            "saved_id": saved_id,
            "name": saved_name,
            "estimated_lifetime_tax_savings_todays_dollars": round(
                result.estimated_lifetime_tax_savings
            ),
            "open_url": _saved_url(saved_id),
            "my_scenarios_url": _link(f"{site_url()}/my-scenarios"),
        }
    )


@mcp.tool(
    title="List saved scenarios",
    annotations=_ACCOUNT,
    meta=_account_meta(),
    description=(
        "List the scenarios the user saved to their account (from a chat or the website), "
        "most recently saved first, with each one's estimated lifetime tax savings when it "
        "was last saved. "
        "Needs the user to sign in."
    ),
)
@_tracked
async def list_saved_scenarios() -> CallToolResult:
    user_id = _signed_in_user()
    if user_id is None:
        return _sign_in_required()
    try:
        rows = await saved_store.list_for(user_id)
    except saved_store.StorageUnavailable:
        return _storage_unavailable()
    return _result(
        {
            "scenarios": [
                {
                    "saved_id": row.id,
                    "name": row.name,
                    "saved_on": row.updated_at.date().isoformat(),
                    "estimated_lifetime_tax_savings_todays_dollars": round(row.estimated_savings),
                    "open_url": _saved_url(row.id),
                }
                for row in rows
            ],
            "my_scenarios_url": _link(f"{site_url()}/my-scenarios"),
        }
    )


@mcp.tool(
    title="Open a saved scenario",
    annotations=_ACCOUNT,
    meta=_account_meta(),
    description=(
        "Load one of the user's saved scenarios as a `scenario` to pass to the other tools, "
        "to pick up where they left off. Confirm the values with the user (ages and "
        "balances may have changed since it was saved) before analyzing it again. Needs the "
        "user to sign in."
    ),
)
@_tracked
async def open_saved_scenario(
    saved_id: Annotated[str, Field(description="saved_id from list_saved_scenarios")],
) -> CallToolResult:
    user_id = _signed_in_user()
    if user_id is None:
        return _sign_in_required()
    try:
        saved = await saved_store.get(user_id, saved_id)
    except saved_store.StorageUnavailable:
        return _storage_unavailable()
    if saved is None:
        return _error("No saved scenario with that saved_id. Call list_saved_scenarios.")
    approximate = saved.scenario is None
    scenario = (
        core.upgrade_scenario(saved.scenario, saved.updated_at.year)
        if saved.scenario
        else core.scenario_from_input(saved.inputs, current_year())
    )
    data = {
        "saved_id": saved.id,
        "name": saved.name,
        "saved_on": saved.updated_at.date().isoformat(),
        "estimated_lifetime_tax_savings_when_saved": round(
            float(saved.result.get("estimated_lifetime_tax_savings") or 0)
        ),
        "scenario": scenario,
        "open_url": _saved_url(saved.id),
    }
    if approximate:
        data["note"] = (
            "Saved on the website, so this scenario is rebuilt from the saved analysis and "
            "may differ in detail. open_url reopens the exact saved version."
        )
    return _result(data)


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


def _polish_tool_listings() -> None:
    """Fill gaps the Claude directory's tool check flags in tools/list.

    Pydantic writes model and enum parameters as a bare {"$ref": ...}, so the type is
    copied from the referenced definition onto the parameter. annotations.title repeats
    the tool's title for clients that only read annotations.
    """
    for tool in mcp._tool_manager.list_tools():
        defs = tool.parameters.get("$defs", {})
        for prop in tool.parameters.get("properties", {}).values():
            ref = prop.get("$ref", "")
            target = defs.get(ref.removeprefix("#/$defs/"), {})
            if "type" not in prop and "type" in target:
                prop["type"] = target["type"]
        if tool.annotations is not None:
            tool.annotations = tool.annotations.model_copy(update={"title": tool.title})


_polish_tool_listings()

# PostHog MCP Analytics: before build_route() creates the ASGI app.
analytics.instrument(mcp, _signed_in_user)


# --------------------------------------------------------------------------
# ASGI app: who is calling, and the sign-in gate for account tools
# --------------------------------------------------------------------------

# The web app's own agent can reach this server over HTTP (AGENT_MCP_URL). Its calls
# all come from the backend's IP and are already limited per user at /api/agent, so
# they carry a shared secret and skip the per-caller limits.
INTERNAL_HEADER = "x-lucerna-internal"


def internal_token() -> str:
    return settings().mcp_internal_token


def _is_internal(request: Request) -> bool:
    token = internal_token()
    return bool(token) and hmac.compare_digest(request.headers.get(INTERNAL_HEADER, ""), token)


async def _read_body(receive) -> bytes:
    chunks = []
    while True:
        message = await receive()
        if message["type"] != "http.request":
            break
        chunks.append(message.get("body", b""))
        if not message.get("more_body"):
            break
    return b"".join(chunks)


def _replay(body: bytes, receive):
    sent = False

    async def replay():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return replay


class _IdentifyCaller:
    """Records who is calling (for the analysis limits in app.mcp.limits) and asks for
    sign-in when an account tool is called without a valid token.

    The challenge must be an HTTP 401 sent before the MCP SDK runs: a tool result is
    always wrapped in a 200, and clients only start sign-in on the 401.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        caller = None
        client = None
        user_agent = ""
        if scope["type"] == "http":
            request = Request(scope)
            user_agent = request.headers.get("user-agent", "")
            client = analytics.client_from(user_agent, internal=_is_internal(request))
            user_id = None
            token = mcp_auth.bearer_token(request)
            if token and mcp_auth.auth_issuer():
                user_id = await anyio.to_thread.run_sync(mcp_auth.verify_access_token, token)
            if user_id:
                caller = f"user:{user_id}"
            elif not _is_internal(request):
                caller = f"ip:{client_ip(request)}"
            if scope.get("method") == "POST" and not user_id and mcp_auth.auth_issuer():
                body = await _read_body(receive)
                receive = _replay(body, receive)
                try:
                    message = json.loads(body or b"null")
                except ValueError:
                    message = None
                if mcp_auth.calls_account_tool(message):
                    challenge = mcp_auth.www_authenticate(request, invalid_token=bool(token))
                    response = JSONResponse(
                        {"error": "invalid_token", "error_description": "Sign in to continue"},
                        status_code=401,
                        headers={"WWW-Authenticate": challenge},
                    )
                    await response(scope, receive, send)
                    return
        reset = current_caller.set(caller)
        client_reset = analytics.current_client.set(client)
        ua_reset = analytics.current_user_agent.set(user_agent)
        try:
            await self.app(scope, receive, send)
        finally:
            analytics.current_user_agent.reset(ua_reset)
            analytics.current_client.reset(client_reset)
            current_caller.reset(reset)


def build_route() -> Route:
    """Route serving the MCP endpoint at exactly /mcp (no redirect).

    The session manager must run in the host app's lifespan.
    """
    return Route(
        "/mcp",
        endpoint=_IdentifyCaller(mcp.streamable_http_app()),
        methods=["GET", "POST", "DELETE"],
    )
