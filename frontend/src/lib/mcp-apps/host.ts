/**
 * MCP Apps host helpers (the browser half of the host).
 *
 * The backend's MCP server owns each View: an HTML bundle served as a ui:// resource.
 * This module fetches it through the backend (resources/read), builds the sandbox
 * proxy URL, brokers a View's tools/call, and decides what a View's open-link
 * request does here.
 */

import type { McpToolResult } from "@/lib/agent/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface McpView {
  uri: string;
  mimeType: string;
  html: string;
  csp: Record<string, string[]>;
  permissions: Record<string, object>;
  prefersBorder?: boolean | null;
}

const viewCache = new Map<string, Promise<McpView>>();

/** resources/read for a View, cached for the page's lifetime. */
export function fetchView(uri: string): Promise<McpView> {
  let pending = viewCache.get(uri);
  if (!pending) {
    pending = fetch(`${API_BASE}/api/mcp-apps/resource?uri=${encodeURIComponent(uri)}`).then(
      async (res) => {
        if (!res.ok) throw new Error(`Could not load the view (${res.status})`);
        return (await res.json()) as McpView;
      }
    );
    pending.catch(() => viewCache.delete(uri));
    viewCache.set(uri, pending);
  }
  return pending;
}

/** Sandbox proxy on the API's origin, which differs from this page's (spec requirement). */
export function sandboxUrl(csp: McpView["csp"]): string {
  const url = new URL("/mcp-apps/sandbox", API_BASE);
  url.searchParams.set("csp", JSON.stringify(csp ?? {}));
  if (typeof window !== "undefined") url.searchParams.set("host", window.location.origin);
  return url.toString();
}

export function sandboxOrigin(): string {
  return new URL(API_BASE).origin;
}

/** A View's tools/call, brokered by the backend (only tools visible to apps). */
export async function callAppTool(
  name: string,
  args: Record<string, unknown> | undefined
): Promise<McpToolResult> {
  const res = await fetch(`${API_BASE}/api/mcp-apps/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args ?? {} }),
  });
  if (!res.ok) {
    return { isError: true, content: [{ type: "text", text: `Tool call failed (${res.status})` }] };
  }
  return res.json();
}

export type OpenLinkAction =
  | { type: "results"; resultId: string }
  | { type: "external"; url: string };

/**
 * A View asked to open a link. Links to a result's full results page open in the app
 * when the conversation has that result. Otherwise a full results link (it carries its
 * scenario) opens on this deployment rather than the production site it names, and
 * anything else opens as is.
 */
export function routeOpenLink(url: string, knownResultIds: Iterable<string>): OpenLinkAction {
  try {
    const parsed = new URL(url);
    const resultId = parsed.searchParams.get("result");
    const known = new Set(knownResultIds);
    if (
      parsed.pathname === "/calculator" &&
      parsed.searchParams.get("view") === "results" &&
      resultId &&
      known.has(resultId)
    ) {
      return { type: "results", resultId };
    }
    if (
      parsed.pathname === "/calculator" &&
      parsed.searchParams.get("view") === "results" &&
      parsed.searchParams.get("scenario") &&
      typeof window !== "undefined"
    ) {
      return {
        type: "external",
        url: `${window.location.origin}/calculator${parsed.search}`,
      };
    }
  } catch {
    // Fall through to external handling.
  }
  return { type: "external", url };
}
