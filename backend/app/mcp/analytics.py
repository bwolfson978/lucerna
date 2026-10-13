"""MCP analytics: one PostHog event per tool call and tool listing, from every client.

Hooks the MCP server's request handlers, so it sees the same calls whether they come
over HTTP (/mcp: Claude, ChatGPT, other MCP clients) or in process (the website's own
assistant, an MCP client of this server).

Event and property names follow PostHog's MCP analytics SDK (``@posthog/mcp``, which is
TypeScript only), so the data fits PostHog's MCP views as they appear. Unlike that SDK,
tool arguments and results are never sent (they hold people's financial details) and
no parameters are added to tool schemas.

Each event carries ``channel``: where the person is using the product.
- ``web_assistant``: the website's own assistant (and Views it shows),
- ``claude``: Claude (claude.ai, the apps, Claude Code),
- ``chatgpt``: ChatGPT,
- ``mcp_other``: any other MCP client.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from mcp import types

from app import analytics
from app.auth.identity import CALLER_SCOPE_KEY, USER_SCOPE_KEY, Caller, current_caller

logger = logging.getLogger(__name__)

WEB_ASSISTANT = "web_assistant"
CLIENT_NAME_WEB = "roth-conversions-web"

_CLAUDE_HINTS = ("claude", "anthropic")
_CHATGPT_HINTS = ("chatgpt", "openai")


def detect_channel(caller: Caller, *, client_name: str | None, headers: dict[str, str]) -> str:
    """Which app the person is using, from what the client tells us about itself."""
    if caller.channel:
        return caller.channel
    clues = " ".join(
        value
        for value in (
            caller.oauth_client_id,  # with CIMD, a URL on the client's own domain
            client_name,
            headers.get("x-anthropic-client"),
            headers.get("user-agent"),
        )
        if value
    ).lower()
    if any(hint in clues for hint in _CLAUDE_HINTS):
        return "claude"
    if any(hint in clues for hint in _CHATGPT_HINTS):
        return "chatgpt"
    return "mcp_other"


def _request_info(server) -> tuple[Caller, dict[str, str], str, Any]:
    """The caller, HTTP headers, transport and client info for the current request."""
    try:
        ctx = server.request_context
    except LookupError:
        return current_caller(), {}, "in_process", None
    client_info = getattr(getattr(ctx.session, "client_params", None), "clientInfo", None)
    request = getattr(ctx, "request", None)
    scope = getattr(request, "scope", None)
    if not isinstance(scope, dict):
        return current_caller(), {}, "in_process", client_info
    caller = scope.get(CALLER_SCOPE_KEY) or Caller(user_id=scope.get(USER_SCOPE_KEY))
    headers = {k.lower(): v for k, v in request.headers.items()}
    return caller, headers, "http", client_info


def _properties(server) -> tuple[str | None, dict[str, Any]]:
    caller, headers, transport, client_info = _request_info(server)
    client_name = getattr(client_info, "name", None)
    channel = detect_channel(caller, client_name=client_name, headers=headers)
    if channel == WEB_ASSISTANT:
        client_name = CLIENT_NAME_WEB
    properties: dict[str, Any] = {
        "channel": channel,
        "signed_in": caller.user_id is not None,
        "mcp_transport": transport,
        "$mcp_server_name": server.name,
        "$mcp_client_name": client_name,
        "$mcp_client_version": getattr(client_info, "version", None),
        "$mcp_client_user_agent": headers.get("user-agent"),
        "$mcp_vendor_client": headers.get("x-anthropic-client"),
        "$mcp_protocol_version": headers.get("mcp-protocol-version"),
        "oauth_client_id": caller.oauth_client_id,
        # Ties the website assistant's tool calls to the browser session (and its replay).
        "$session_id": caller.session_id,
    }
    properties = {k: v for k, v in properties.items() if v is not None}
    return caller.user_id or caller.anonymous_id, properties


def _error_type(result: types.CallToolResult) -> str:
    structured = result.structuredContent if isinstance(result.structuredContent, dict) else {}
    code = structured.get("code")
    if isinstance(code, str) and code:
        return code  # e.g. sign_in_required, not_found
    if structured.get("missing_required"):
        return "missing_required"
    return "tool_error"


def _safe_capture(event: str, server, extra: dict[str, Any]) -> None:
    try:
        distinct_id, properties = _properties(server)
        if event == "$mcp_tools_list" and properties["channel"] == WEB_ASSISTANT:
            return  # the website lists tools on every turn; that's plumbing, not usage
        analytics.capture(event, distinct_id=distinct_id, properties=properties | extra)
    except Exception:  # analytics must never break a tool call
        logger.exception("Couldn't record %s", event)


def instrument(mcp) -> None:
    """Record tool calls and tool listings for ``mcp`` (a FastMCP server)."""
    server = mcp._mcp_server
    call_tool = server.request_handlers[types.CallToolRequest]
    list_tools = server.request_handlers[types.ListToolsRequest]

    async def on_call_tool(request: types.CallToolRequest):
        started = time.perf_counter()
        try:
            response = await call_tool(request)
        except Exception:
            _safe_capture(
                "$mcp_tool_call",
                server,
                {
                    "$mcp_tool_name": request.params.name,
                    "$mcp_duration_ms": round((time.perf_counter() - started) * 1000),
                    "$mcp_is_error": True,
                    "$mcp_error_type": "exception",
                },
            )
            raise
        result = response.root if isinstance(response, types.ServerResult) else response
        is_error = bool(getattr(result, "isError", False))
        extra: dict[str, Any] = {
            "$mcp_tool_name": request.params.name,
            "$mcp_duration_ms": round((time.perf_counter() - started) * 1000),
            "$mcp_is_error": is_error,
        }
        if is_error and isinstance(result, types.CallToolResult):
            extra["$mcp_error_type"] = _error_type(result)
        _safe_capture("$mcp_tool_call", server, extra)
        return response

    async def on_list_tools(request: types.ListToolsRequest):
        response = await list_tools(request)
        result = response.root if isinstance(response, types.ServerResult) else response
        names = [tool.name for tool in getattr(result, "tools", [])]
        _safe_capture("$mcp_tools_list", server, {"$mcp_listed_tool_names": names})
        return response

    server.request_handlers[types.CallToolRequest] = on_call_tool
    server.request_handlers[types.ListToolsRequest] = on_list_tools
