"use client";

/**
 * Renders a tool result with the MCP server's own View (MCP Apps).
 *
 * This component is the host: it mounts the View in a sandbox proxy on another
 * origin, connects the official AppBridge over postMessage, hands the View the tool
 * input and result, and handles what the View asks for (resizing, opening links,
 * calling app-visible tools). The View's code comes from the server, not from here.
 *
 * Until the View is ready (or if it fails), the same shared component the View
 * renders is shown natively from the tool result (ViewFallback), so the swap is seamless.
 */

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import type { McpToolResult } from "@/lib/agent/types";
import {
  callAppTool,
  fetchView,
  routeOpenLink,
  sandboxOrigin,
  sandboxUrl,
} from "@/lib/mcp-apps/host";
import { useConversationContext } from "../ConversationContext";
import { ViewFallback, hasViewFallback } from "./ViewFallback";

const HOST_INFO = { name: "Roth Conversions Optimizer", version: "1.0.0" };
const MAX_HEIGHT = 2000;

interface McpAppFrameProps {
  resourceUri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: McpToolResult;
}

export function McpAppFrame({ resourceUri, toolName, toolInput, toolResult }: McpAppFrameProps) {
  const { results, openResults, send, streaming } = useConversationContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Handlers read the latest results without re-mounting the View.
  const latest = useRef({ results, openResults, send, streaming });
  useEffect(() => {
    latest.current = { results, openResults, send, streaming };
  }, [results, openResults, send, streaming]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let disposed = false;
    let bridge: { close: () => Promise<void> } | null = null;

    (async () => {
      try {
        const [{ AppBridge, PostMessageTransport }, view] = await Promise.all([
          import("@modelcontextprotocol/ext-apps/app-bridge"),
          fetchView(resourceUri),
        ]);
        if (disposed) return;

        // 1. Load the sandbox proxy (separate origin, CSP from the View's metadata).
        const proxyReady = new Promise<void>((resolve) => {
          const onMessage = (event: MessageEvent) => {
            if (
              event.source === iframe.contentWindow &&
              event.origin === sandboxOrigin() &&
              event.data?.method === "ui/notifications/sandbox-proxy-ready"
            ) {
              window.removeEventListener("message", onMessage);
              resolve();
            }
          };
          window.addEventListener("message", onMessage);
        });
        iframe.src = sandboxUrl(view.csp);
        await proxyReady;
        if (disposed || !iframe.contentWindow) return;

        // 2. Connect the bridge and answer the View's requests.
        const width = Math.round(iframe.getBoundingClientRect().width) || undefined;
        const appBridge = new AppBridge(
          null,
          HOST_INFO,
          { openLinks: {}, serverTools: {}, message: { text: {} } },
          {
            hostContext: {
              theme: "light",
              platform: window.matchMedia?.("(pointer: coarse)").matches ? "mobile" : "web",
              displayMode: "inline",
              availableDisplayModes: ["inline"],
              containerDimensions: { width, maxHeight: MAX_HEIGHT },
              locale: navigator.language,
              toolInfo: { tool: { name: toolName, inputSchema: { type: "object" } } },
            },
          }
        );
        bridge = appBridge;
        appBridge.onsizechange = ({ height: next }) => {
          if (typeof next === "number" && next > 0) setHeight(Math.min(next, MAX_HEIGHT));
        };
        appBridge.onopenlink = async ({ url }) => {
          const action = routeOpenLink(url, Object.keys(latest.current.results));
          if (action.type === "results") {
            posthog.capture("full_results_opened", { from: "mcp_app" });
            latest.current.openResults(action.resultId);
          } else {
            window.open(action.url, "_blank", "noopener,noreferrer");
          }
          return {};
        };
        // ui/message: a View's button speaks for the user ("Run the numbers").
        appBridge.onmessage = async ({ content }) => {
          const text = content
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("\n")
            .trim();
          if (!text || latest.current.streaming) return { isError: true };
          posthog.capture("mcp_app_message");
          latest.current.send(text);
          return {};
        };
        appBridge.oncalltool = async (params) =>
          (await callAppTool(params.name, params.arguments)) as never;
        appBridge.onloggingmessage = () => {};

        const initialized = new Promise<void>((resolve) => {
          appBridge.oninitialized = () => resolve();
        });
        await appBridge.connect(
          new PostMessageTransport(iframe.contentWindow, iframe.contentWindow)
        );

        // 3. Hand the View its HTML, then the tool input and result.
        await appBridge.sendSandboxResourceReady({
          html: view.html,
          csp: view.csp,
          permissions: view.permissions,
        });
        await initialized;
        if (disposed) return;
        await appBridge.sendToolInput({ arguments: toolInput });
        await appBridge.sendToolResult(toolResult as never);
        setStatus("ready");
      } catch {
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      void bridge?.close();
    };
    // The View is mounted once per part; the inputs never change for a given part.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceUri]);

  const ready = status === "ready";
  const openResult = (id: string) =>
    results[id]
      ? () => {
          posthog.capture("full_results_opened", { from: "mcp_app_fallback" });
          openResults(id);
        }
      : undefined;
  const hasFallback = !ready && hasViewFallback(toolResult);

  return (
    <div className="relative" data-testid="mcp-app" data-status={status}>
      {hasFallback && (
        <div data-testid="mcp-app-fallback">
          <ViewFallback toolResult={toolResult} openResult={openResult} sendMessage={send} />
        </div>
      )}
      <iframe
        ref={iframeRef}
        title={`${toolName} result`}
        sandbox="allow-scripts allow-same-origin allow-forms"
        aria-hidden={!ready}
        className={
          ready
            ? "block w-full border-0 bg-transparent"
            : "pointer-events-none absolute inset-x-0 top-0 w-full border-0 bg-transparent opacity-0"
        }
        style={{ height }}
      />
      {!ready && !hasFallback && (
        <div
          role="status"
          className="flex min-h-[120px] items-center justify-center rounded-[20px] border border-border bg-white text-body-sm text-text-tertiary"
        >
          {status === "error" ? "This result couldn't be displayed." : "Loading the result…"}
        </div>
      )}
    </div>
  );
}
