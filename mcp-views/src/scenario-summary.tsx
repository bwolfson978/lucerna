/**
 * Scenario View for `prepare_scenario` (MCP Apps): the shared ScenarioSummary (ui/),
 * read-only, with what is still missing. When the scenario is complete, "Run the
 * numbers" asks the host to send the same chat message the web app sends.
 */

import { useState } from "react";
import {
  RUN_MESSAGE,
  ScenarioSummary,
  isScenarioSummaryData,
  type ScenarioSummaryData,
} from "@lucerna/ui";
import { startView, type ViewContext } from "./view";

interface Recorded extends ScenarioSummaryData {
  missing_required?: string[];
  ready_to_run?: boolean;
}

function Summary({ data, view }: { data: Recorded; view: ViewContext }) {
  const [sent, setSent] = useState(false);
  const ready = data.ready_to_run === true;
  return (
    <ScenarioSummary
      data={data}
      badge={sent ? "Confirmed" : undefined}
      missing={data.missing_required ?? []}
      onRun={
        ready && view.canMessage
          ? async () => setSent(await view.sendMessage(RUN_MESSAGE))
          : undefined
      }
      runDisabled={sent}
      hint="To change a value, say so in the chat."
    />
  );
}

startView("Your scenario", (result, view) => {
  const data = result.structuredContent;
  return isScenarioSummaryData(data) ? <Summary data={data as Recorded} view={view} /> : null;
});
