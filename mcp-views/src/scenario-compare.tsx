/**
 * What-if View for `compare_roth_scenarios` (MCP Apps): the shared ScenarioCompareCard
 * (ui/). "Apply to my scenario" asks the host to send a chat message, so the model
 * records the what-if as the scenario the same way in every host.
 */

import { useState } from "react";
import {
  ScenarioCompareCard,
  applyWhatIfMessage,
  isScenarioCompareData,
  type ScenarioCompareData,
} from "@lucerna/ui";
import { startView, type ViewContext } from "./view";

function Compare({ data, view }: { data: ScenarioCompareData; view: ViewContext }) {
  const [applied, setApplied] = useState(false);
  const url = (data as { what_if_full_results_url?: unknown }).what_if_full_results_url;
  return (
    <ScenarioCompareCard
      data={data}
      onOpenFullResults={typeof url === "string" ? () => view.openLink(url) : undefined}
      onApply={
        view.canMessage
          ? async () => setApplied(await view.sendMessage(applyWhatIfMessage(data.label)))
          : undefined
      }
      applied={applied}
    />
  );
}

startView("What-if comparison", (result, view) => {
  const data = result.structuredContent;
  return isScenarioCompareData(data) ? <Compare data={data} view={view} /> : null;
});
