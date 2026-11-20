/**
 * Data for the shared cards (ui/). What a result shows is built once, on the server
 * (backend app/tools/views.py result_display), and arrives with every full result as
 * `result.display`: the same structuredContent and View `_meta` the MCP App Views get.
 * The web app reads it here and never rebuilds it.
 */

import {
  isResultCardData,
  isResultDetails,
  type ResultCardData,
  type ResultDetails,
  type ScenarioSummaryData,
} from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";
import type { ScenarioDraft } from "@/lib/scenario/draft";

/** Whether a result carries usable display data. One stored before the server sent it
 * (an older tab session) does not, and is recomputed. */
export function hasDisplay(result: OptimizationResult | null | undefined): boolean {
  return (
    !!result && isResultCardData(result.display?.card) && isResultDetails(result.display?.view)
  );
}

/** The result card's props for a result, under the id the web app knows it by. */
export function resultDisplay(
  resultId: string,
  result: OptimizationResult
): { data: ResultCardData; details: ResultDetails } | null {
  if (!hasDisplay(result)) return null;
  const { card, view } = result.display!;
  return { data: { ...card, result_id: resultId }, details: view };
}

export function summaryData(draft: ScenarioDraft): ScenarioSummaryData {
  const { timeline, ...scenario } = draft;
  return {
    scenario,
    timeline: timeline.map((y) => ({ year: y.year, gross_income: y.gross_income, note: y.notes })),
  };
}
