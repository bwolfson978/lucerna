/**
 * Shared setup for every View: connect to the host, render a shared component from
 * each tool result, and show a short message for errors and cancellations. React here
 * is preact/compat (aliased in build.mjs) to keep the View small.
 */

import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/client";

/** Chart series the server sends Views in `_meta` (backend app/tools/views.py). */
export const VIEW_META_KEY = "lucerna/view";

export interface ViewContext {
  app: App;
  /** The host accepts `ui/message`, so buttons can speak for the user. */
  canMessage: boolean;
  /** Send a chat message as the user. */
  sendMessage: (text: string) => Promise<boolean>;
  /** Ask the host to open a link, such as a result's `full_results_url`. */
  openLink: (url: string) => void;
  /** Tell the host's model what the user is looking at (sent after a short pause, so a
   * dragged slider reports where it stopped). Ignored by hosts without it. */
  updateContext: (text: string) => void;
}

/** How long a View waits after the last change before updating the model's context. */
const CONTEXT_DELAY_MS = 600;

export function startView(
  name: string,
  render: (result: CallToolResult, view: ViewContext) => ReactNode | null
): void {
  const root = createRoot(document.getElementById("root")!);
  const app = new App({ name, version: "1.0.0" }, {}, { autoResize: true });
  let contextTimer: ReturnType<typeof setTimeout> | undefined;

  const message = (text: string) =>
    root.render(<p className="p-default text-body-sm text-text-tertiary m-0">{text}</p>);

  const view: ViewContext = {
    app,
    get canMessage() {
      return !!app.getHostCapabilities()?.message;
    },
    sendMessage: async (text) => {
      try {
        const result = await app.sendMessage({
          role: "user",
          content: [{ type: "text", text }],
        });
        return !result.isError;
      } catch {
        return false;
      }
    },
    openLink: (url) => void app.openLink({ url }),
    updateContext: (text) => {
      clearTimeout(contextTimer);
      contextTimer = setTimeout(() => {
        if (!app.getHostCapabilities()?.updateModelContext) return;
        app.updateModelContext({ content: [{ type: "text", text }] }).catch(() => {});
      }, CONTEXT_DELAY_MS);
    },
  };

  app.ontoolresult = (result) => {
    if (result.isError) {
      message("This couldn't run for the scenario.");
      return;
    }
    const node = render(result as CallToolResult, view);
    if (node) root.render(node);
    else message("Nothing to show.");
  };
  app.ontoolcancelled = () => message("Cancelled.");

  // Match the page's color scheme to the host's theme. When the two differ (a light
  // page in a dark Claude), the browser paints an opaque white canvas behind the
  // iframe, which shows as a square box around the rounded card. The cards stay
  // light either way (#root in view.css).
  app.onhostcontextchanged = (ctx) => {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
  };

  message("Working on it…");
  void app.connect().then(() => {
    const theme = app.getHostContext()?.theme;
    if (theme) applyDocumentTheme(theme);
  });
}
