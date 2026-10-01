/**
 * Result card View for `analyze_roth_conversions` (MCP Apps).
 *
 * Runs inside a host's sandboxed iframe (Claude, ChatGPT, or this product's web
 * app). It renders the tool's structuredContent with the shared ResultCard from
 * ui/, the same component the web app renders natively, and never fetches anything
 * itself. React here is preact/compat (aliased in build.mjs) to keep the View small.
 * "See full results" asks the host to open a link; the host decides what to do.
 */

import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { ResultCard, isResultCardData } from "@lucerna/ui";

const SITE = "https://rothconversionsoptimizer.com";

const root = createRoot(document.getElementById("root")!);
const app = new App({ name: "Roth conversion result", version: "1.0.0" }, {}, { autoResize: true });

function message(text: string) {
  root.render(<p className="p-default text-body-sm text-text-tertiary m-0">{text}</p>);
}

app.ontoolresult = (result) => {
  if (result.isError) {
    message("The analysis couldn't run for this scenario.");
    return;
  }
  const data = result.structuredContent;
  if (!isResultCardData(data)) {
    message("No result to show.");
    return;
  }
  const openFullResults = () => {
    const url = new URL("/calculator", SITE);
    url.searchParams.set("view", "results");
    url.searchParams.set("result", data.result_id);
    void app.openLink({ url: url.toString() });
  };
  root.render(<ResultCard data={data} onOpenFullResults={openFullResults} />);
};

app.ontoolcancelled = () => message("The analysis was cancelled.");

message("Running the optimizer…");
await app.connect();
