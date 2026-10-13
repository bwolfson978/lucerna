/**
 * Shared setup for every View: connect to the host, render a shared component from
 * each tool result, and show a short message for errors and cancellations. React here
 * is preact/compat (aliased in build.mjs) to keep the View small.
 */

import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
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
}

export function startView(
  name: string,
  render: (result: CallToolResult, view: ViewContext) => ReactNode | null
): void {
  const root = createRoot(document.getElementById("root")!);
  const app = new App({ name, version: "1.0.0" }, {}, { autoResize: true });

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

  message("Working on it…");
  void app.connect();
}
