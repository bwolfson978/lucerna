"""Remote MCP server at /mcp (streamable HTTP).

Exposes the same transport-neutral tools as the web agent so any MCP client
(a Claude connector, a ChatGPT app, an IDE agent) can answer Roth conversion
questions with this engine. MCP tools are stateless: each call carries the full
scenario, built with the same draft rules as the calculator form.
"""

from __future__ import annotations

import os
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.agent.limits import UsageLimiter
from app.engine.types import FilingStatus
from app.tools import core
from app.tools.draft import ScenarioDraft, current_year
from app.tools.models import MethodologyTopic, ScenarioUpdate

INSTRUCTIONS = """\
Roth Conversions Optimizer runs a deterministic multi-year optimizer that finds the Roth \
conversion schedule with the highest after-tax wealth for a scenario, using 2026 federal and \
state brackets, RMDs, IRMAA and ACA subsidies. Results are educational scenario analysis, not \
financial advice: present them as "the analysis shows" and as trade-offs, never as \
instructions. Quote numbers only from tool results. Required inputs: age, filing status, \
current gross income, traditional IRA/401(k) balance and the age withdrawals begin \
(retirement_age). Ask the user for any that are missing instead of guessing. The full \
interactive analysis is available at https://rothconversionsoptimizer.com/calculator."""

_READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False, idempotentHint=True)

mcp = FastMCP(
    name="Roth Conversions Optimizer",
    instructions=INSTRUCTIONS,
    website_url="https://rothconversionsoptimizer.com",
    stateless_http=True,
    json_response=True,
    # Public remote server: requests arrive with the deployment's host name.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


def _draft_from(scenario: ScenarioUpdate) -> ScenarioDraft:
    return core.apply_update(ScenarioDraft(), scenario, current_year())


def _missing_response(draft: ScenarioDraft) -> dict[str, Any] | None:
    described = core.describe_draft(draft)
    if described["ready_to_run"]:
        return None
    return {
        "error": "The scenario is incomplete. Ask the user for the missing values.",
        "missing_required": described["missing_required"],
        "problems": described["problems"],
    }


@mcp.tool(
    title="Analyze Roth conversions",
    annotations=_READ_ONLY,
    description=(
        "Find the Roth conversion schedule with the highest estimated lifetime tax savings for "
        "a scenario. Returns savings in today's dollars, the conversion amount and tax for each "
        "year, alternatives (no conversion, full conversion) and the engine's reasoning. "
        "income_changes sets specific years' income (sabbaticals, Social Security starting)."
    ),
)
def analyze_roth_conversions(scenario: ScenarioUpdate) -> dict[str, Any]:
    try:
        draft = _draft_from(scenario)
        if missing := _missing_response(draft):
            return missing
        scenario_input, result = core.run_draft(draft)
    except core.ToolError as err:
        return {"error": str(err)}
    summary = core.summarize_result(result, core.result_id_for(scenario_input))
    summary["inputs_used"] = core.describe_draft(draft)["values"]
    return summary


@mcp.tool(
    title="Compare Roth conversion scenarios",
    annotations=_READ_ONLY,
    description=(
        "Answer a what-if: run a base scenario and a changed copy (for example a different "
        "retirement age, income or spending) and return how the optimal schedule and estimated "
        "lifetime tax savings change."
    ),
)
def compare_roth_scenarios(
    scenario: ScenarioUpdate,
    changes: ScenarioUpdate,
    label: Annotated[str, Field(min_length=1, max_length=60)] = "What-if",
) -> dict[str, Any]:
    try:
        base_draft = _draft_from(scenario)
        if missing := _missing_response(base_draft):
            return missing
        variant_draft = core.apply_update(base_draft, changes, current_year())
        base_input, base = core.run_draft(base_draft)
        variant_input, variant = core.run_draft(variant_draft)
    except core.ToolError as err:
        return {"error": str(err)}
    return core.compare_results(
        base, variant, core.result_id_for(base_input), core.result_id_for(variant_input), label
    )


@mcp.tool(
    title="Get tax brackets",
    annotations=_READ_ONLY,
    description="2026 federal (and optionally state) income tax brackets and standard deductions.",
)
def get_tax_brackets(filing_status: FilingStatus, state: str | None = None) -> dict[str, Any]:
    try:
        return core.tax_brackets(filing_status, state)
    except core.ToolError as err:
        return {"error": str(err)}


@mcp.tool(
    title="Explain the methodology",
    annotations=_READ_ONLY,
    description=(
        "How the optimizer works and the concepts behind it: the savings number, bracket "
        "filling, the conversion trade-off, multi-year allocation, assumptions and limits, "
        "Roth conversions, RMDs, ACA subsidies, IRMAA, state taxes and using the tool."
    ),
)
def explain_methodology(topic: MethodologyTopic) -> str:
    return core.methodology_text(topic.value)


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


# --------------------------------------------------------------------------
# ASGI app with a per-IP daily request limit
# --------------------------------------------------------------------------

_mcp_limiter = UsageLimiter()


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
