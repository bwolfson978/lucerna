/**
 * Result card View for `analyze_roth_conversions` (MCP Apps): the shared ResultCard
 * (ui/) with its bracket and balance charts, from the tool's structuredContent and
 * View `_meta`. "See full results" asks the host to open the result's
 * `full_results_url`, which carries the scenario so the website can rebuild it.
 */

import { ResultCard, isResultCardData, isResultDetails } from "@lucerna/ui";
import { VIEW_META_KEY, startView } from "./view";

startView("Roth conversion result", (result, view) => {
  const data = result.structuredContent;
  if (!isResultCardData(data)) return null;
  const details = result._meta?.[VIEW_META_KEY];
  const url = (data as { full_results_url?: unknown }).full_results_url;
  return (
    <ResultCard
      data={data}
      details={isResultDetails(details) ? details : undefined}
      onOpenFullResults={typeof url === "string" ? () => view.openLink(url) : undefined}
    />
  );
});
