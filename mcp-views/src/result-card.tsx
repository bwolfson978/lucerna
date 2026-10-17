/**
 * Result card View for `analyze_roth_conversions` (MCP Apps): the shared ResultCard
 * (ui/) with its tax bracket chart and slider, from the tool's structuredContent and
 * View `_meta`. "See full results" asks the host to open the result's
 * `full_results_url`, which carries the scenario so the website can rebuild it.
 * Moving the slider tells the host's model where it is, and "Ask about" sends a
 * question about that total as the user.
 */

import {
  ResultCard,
  formatCurrency,
  isResultCardData,
  isResultDetails,
  type ResultCardSelection,
} from "@lucerna/ui";
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
      onAsk={view.canMessage ? (text) => void view.sendMessage(text) : undefined}
      onSelectionChange={(selection) => view.updateContext(describe(selection))}
    />
  );
});

function describe(s: ResultCardSelection): string {
  if (s.total === s.optimalTotal) {
    return `The user is looking at the result card at the schedule with the most estimated savings: converting ${formatCurrency(s.total)} in total, ${formatCurrency(s.savings)} of estimated lifetime tax savings.`;
  }
  return `The user moved the result card's slider to a total conversion of ${formatCurrency(s.total)}, which shows ${formatCurrency(s.savings)} of estimated lifetime tax savings, compared with ${formatCurrency(s.optimalSavings)} at ${formatCurrency(s.optimalTotal)}, the total with the most savings.`;
}
