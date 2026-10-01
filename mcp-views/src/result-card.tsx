/**
 * Result card View for `analyze_roth_conversions` (MCP Apps): the shared ResultCard
 * (ui/) with its bracket and balance charts, from the tool's structuredContent and
 * View `_meta`. "See full results" asks the host to open a link.
 */

import { ResultCard, isResultCardData, isResultDetails } from "@lucerna/ui";
import { VIEW_META_KEY, startView } from "./view";

startView("Roth conversion result", (result, view) => {
  const data = result.structuredContent;
  if (!isResultCardData(data)) return null;
  const details = result._meta?.[VIEW_META_KEY];
  return (
    <ResultCard
      data={data}
      details={isResultDetails(details) ? details : undefined}
      onOpenFullResults={() => view.openResults(data.result_id)}
    />
  );
});
