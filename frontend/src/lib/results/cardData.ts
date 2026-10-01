import type { ResultCardData } from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";

/**
 * The result card's data from a full engine result, in the same shape (and rounding)
 * as the `structuredContent` the MCP tool returns (backend summarize_result), so the
 * native card and the MCP App View render identical numbers.
 */
export function resultCardData(resultId: string, result: OptimizationResult): ResultCardData {
  const years = result.input.timeline.map((t) => t.year);
  return {
    result_id: resultId,
    estimated_lifetime_tax_savings_todays_dollars: Math.round(
      result.estimated_lifetime_tax_savings
    ),
    total_conversion: Math.round(result.total_conversion),
    total_tax_on_conversions: Math.round(result.total_tax_on_conversions),
    years_with_conversions: result.yearly_conversions.filter((c) => c > 0).length,
    schedule_by_year: result.yearly_conversions.map((c, i) => ({
      year: years[i],
      conversion: Math.round(c),
    })),
  };
}
