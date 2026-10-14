import {
  isResultCardData,
  isResultDetails,
  isScenarioCompareData,
  isScenarioSummaryData,
} from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";
import { normalizeDraft } from "@/lib/scenario/draft";
import fixture from "../../../../../shared/fixtures/view-data.json";
import { compareData, resultCardData, resultDetails, summaryData } from "../viewData";

// One call of each tool with a View (backend/scripts/generate_view_fixtures.py): the
// structuredContent and View _meta feed the View, the full results feed the native
// cards. Both render the same shared components, so their data must agree.

const analysis = fixture.analyze_roth_conversions;
const comparison = fixture.compare_roth_scenarios;
const asResult = (r: unknown) => r as OptimizationResult;

it("result card data matches the tool's structuredContent", () => {
  const structured = analysis.structured_content;
  expect(isResultCardData(structured)).toBe(true);
  expect(resultCardData(analysis.result_id, asResult(analysis.result))).toEqual({
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

it("chart data matches the View _meta", () => {
  expect(isResultDetails(analysis.view_meta)).toBe(true);
  expect(resultDetails(asResult(analysis.result))).toEqual(analysis.view_meta);
});

it("comparison data matches the tool's structuredContent", () => {
  const structured = comparison.structured_content;
  expect(isScenarioCompareData(structured)).toBe(true);
  const native = compareData(
    structured.base_result_id,
    asResult(comparison.base_result),
    structured.variant_result_id,
    asResult(comparison.variant_result),
    comparison.label
  );
  expect(native).toEqual({
    label: structured.label,
    base_result_id: structured.base_result_id,
    variant_result_id: structured.variant_result_id,
    estimated_lifetime_tax_savings: structured.estimated_lifetime_tax_savings,
    tax_breakdown: structured.tax_breakdown,
    conversions_by_year: structured.conversions_by_year,
  });
});

it("summary data from a draft has the record_scenario shape", () => {
  const recorded = fixture.record_scenario.structured_content;
  expect(isScenarioSummaryData(recorded)).toBe(true);
  const draft = normalizeDraft({
    ...recorded.scenario,
    timeline: recorded.timeline.map((y) => ({
      year: y.year,
      gross_income: y.gross_income,
      notes: "note" in y ? (y.note as string) : undefined,
    })),
  } as never);
  const native = summaryData(draft);
  expect(native.timeline).toEqual(recorded.timeline); // toEqual ignores undefined notes
  for (const [key, value] of Object.entries(recorded.scenario)) {
    if (key === "income_changes") continue;
    expect(native.scenario[key as keyof typeof native.scenario]).toEqual(value);
  }
});

it("rejects payloads that are not cards", () => {
  expect(isResultCardData({ result_id: "r_1" })).toBe(false);
  expect(isScenarioCompareData({ label: "x" })).toBe(false);
  expect(isScenarioSummaryData(undefined)).toBe(false);
  expect(isResultDetails({})).toBe(false);
});
