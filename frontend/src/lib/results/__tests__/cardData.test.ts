import { isResultCardData } from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";
import fixture from "../../../../../shared/fixtures/result-card-data.json";
import { resultCardData } from "../cardData";

// One analyze_roth_conversions call (backend/scripts/generate_result_card_fixture.py):
// its structuredContent feeds the MCP App View, its full result feeds the native card.
// Both renders use the shared ResultCard, so their data must agree.
it("native card data matches the tool's structuredContent", () => {
  const structured = fixture.structured_content;
  expect(isResultCardData(structured)).toBe(true);
  const native = resultCardData(fixture.result_id, fixture.result as unknown as OptimizationResult);
  expect(native).toEqual({
    result_id: structured.result_id,
    estimated_lifetime_tax_savings_todays_dollars:
      structured.estimated_lifetime_tax_savings_todays_dollars,
    total_conversion: structured.total_conversion,
    total_tax_on_conversions: structured.total_tax_on_conversions,
    years_with_conversions: structured.years_with_conversions,
    schedule_by_year: structured.schedule_by_year.map(({ year, conversion }) => ({
      year,
      conversion,
    })),
  });
});

it("rejects payloads that are not result cards", () => {
  expect(isResultCardData({ result_id: "r_1" })).toBe(false);
  expect(isResultCardData(undefined)).toBe(false);
});
