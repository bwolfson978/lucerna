"""MCP Apps host support for the web app.

The browser is the host's UI half; these endpoints are its server half:

GET  /api/mcp-apps/resource?uri=ui://...  resources/read for a View (HTML + CSP metadata)
POST /api/mcp-apps/tools/call             a View's tools/call, brokered (app-visible tools only)
GET  /mcp-apps/sandbox                    the sandbox proxy page Views are mounted in

Per the spec, a web host must mount Views through a sandbox proxy on a different
origin from the host page. The proxy is served from this API's origin (the frontend
lives on another), enforces the View's declared CSP with an HTTP header, and relays
postMessage traffic between the host page and the View.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

from app.agent.toolbox import open_toolbox
from app.api.agent import client_ip
from app.auth.identity import acting_as, browser_ids, optional_user
from app.mcp import server as mcp_server
from app.mcp.analytics import WEB_ASSISTANT
from app.origins import is_allowed_origin

router = APIRouter()
sandbox_router = APIRouter()

_DOMAIN = re.compile(r"^(https://(\*\.)?[A-Za-z0-9.-]+(:\d+)?|http://localhost(:\d+)?)$")


class AppToolCall(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)


@router.get("/mcp-apps/resource")
async def read_view(uri: str = Query(min_length=6, max_length=300)):
    if not uri.startswith("ui://"):
        raise HTTPException(status_code=400, detail="Not a UI resource.")
    # Raise HTTP errors outside the MCP session: its task group would wrap them.
    error: str | None = None
    async with open_toolbox() as toolbox:
        try:
            view = await toolbox.read_ui_resource(uri)
        except ValueError as err:
            error = str(err)
    if error is not None:
        raise HTTPException(status_code=404, detail=error)
    return JSONResponse(view, headers={"Cache-Control": "public, max-age=300"})


@router.post("/mcp-apps/tools/call")
async def call_from_view(
    body: AppToolCall, request: Request, user_id: str | None = Depends(optional_user)
):
    key, limit = (
        (f"user:{user_id}", mcp_server._requests_per_user_per_day())
        if user_id
        else (client_ip(request), mcp_server._requests_per_ip_per_day())
    )
    if not mcp_server._mcp_limiter.count_request(key, limit):
        raise HTTPException(status_code=429, detail="Daily request limit reached.")
    denied: str | None = None
    with acting_as(user_id, channel=WEB_ASSISTANT, **browser_ids(request.headers)):
        async with open_toolbox() as toolbox:
            try:
                result = await toolbox.call_from_app(body.name, body.arguments)
            except PermissionError as err:
                denied = str(err)
    if denied is not None:
        raise HTTPException(status_code=403, detail=denied)
    return result


# --------------------------------------------------------------------------
# Sandbox proxy
# --------------------------------------------------------------------------


def _domains(csp: dict, key: str) -> list[str]:
    values = csp.get(key) or []
    if not isinstance(values, list):
        return []
    return [v for v in values if isinstance(v, str) and _DOMAIN.match(v)]


def build_csp(csp: dict, host_origin: str) -> str:
    """CSP for the sandbox (and the View written into it) from the View's declared
    domains. Undeclared origins stay blocked."""
    resources = " ".join(_domains(csp, "resourceDomains"))
    connect = " ".join(_domains(csp, "connectDomains")) or "'none'"
    frames = " ".join(_domains(csp, "frameDomains")) or "'none'"
    base = " ".join(_domains(csp, "baseUriDomains")) or "'self'"
    return "; ".join(
        [
            "default-src 'none'",
            f"script-src 'self' 'unsafe-inline' {resources}".strip(),
            f"style-src 'self' 'unsafe-inline' {resources}".strip(),
            f"img-src 'self' data: {resources}".strip(),
            f"font-src 'self' data: {resources}".strip(),
            f"media-src 'self' data: {resources}".strip(),
            f"connect-src {connect}",
            f"frame-src {frames}",
            f"base-uri {base}",
            "object-src 'none'",
            "form-action 'none'",
            f"frame-ancestors {host_origin}",
        ]
    )


_SANDBOX_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>MCP App sandbox</title>
<style>html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}
iframe{display:block;width:100%;height:100%;border:0}</style></head>
<body><script>
(() => {
  const HOST_ORIGIN = __HOST_ORIGIN__;
  const OWN_ORIGIN = window.location.origin;
  if (window.self === window.top) throw new Error("Only usable inside a host iframe.");
  const inner = document.createElement("iframe");
  inner.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  inner.title = "MCP App";
  document.body.appendChild(inner);
  const PERMISSIONS = { camera: "camera", microphone: "microphone",
    geolocation: "geolocation", clipboardWrite: "clipboard-write" };
  window.addEventListener("message", (event) => {
    if (event.source === window.parent) {
      if (event.origin !== HOST_ORIGIN) return;
      const data = event.data;
      if (data && data.method === "ui/notifications/sandbox-resource-ready") {
        const params = data.params || {};
        const allow = Object.keys(params.permissions || {})
          .filter((k) => PERMISSIONS[k]).map((k) => PERMISSIONS[k]).join("; ");
        if (allow) inner.setAttribute("allow", allow);
        if (typeof params.html === "string") {
          const doc = inner.contentDocument;
          if (doc) { doc.open(); doc.write(params.html); doc.close(); }
          else { inner.srcdoc = params.html; }
        }
      } else if (inner.contentWindow) {
        inner.contentWindow.postMessage(data, "*");
      }
    } else if (event.source === inner.contentWindow) {
      if (event.origin !== OWN_ORIGIN) return;
      window.parent.postMessage(event.data, HOST_ORIGIN);
    }
  });
  window.parent.postMessage(
    { jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready", params: {} },
    HOST_ORIGIN
  );
})();
</script></body></html>"""


def _host_origin(request: Request, host: str | None) -> str:
    """The embedding page's origin: the explicit ?host= or the Referer, if allowed."""
    candidates = [host] if host else []
    referer = request.headers.get("referer")
    if referer:
        match = re.match(r"^(https?://[^/]+)", referer)
        if match:
            candidates.append(match.group(1))
    for origin in candidates:
        if origin and is_allowed_origin(origin):
            return origin
    raise HTTPException(status_code=403, detail="Embedding origin not allowed.")


@sandbox_router.get("/mcp-apps/sandbox", include_in_schema=False)
async def sandbox(request: Request, csp: str = "{}", host: str | None = None):
    origin = _host_origin(request, host)
    try:
        declared = json.loads(csp)
    except ValueError:
        declared = {}
    if not isinstance(declared, dict):
        declared = {}
    html = _SANDBOX_HTML.replace("__HOST_ORIGIN__", json.dumps(origin))
    return HTMLResponse(
        html,
        headers={
            "Content-Security-Policy": build_csp(declared, origin),
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
        },
    )
