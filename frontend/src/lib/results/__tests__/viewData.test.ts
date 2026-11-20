import {
  isResultCardData,
  isResultDetails,
  isScenarioCompareData,
  isScenarioSummaryData,
} from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";
import { normalizeDraft } from "@/lib/scenario/draft";
import fixture from "../../../../../shared/fixtures/view-data.json";
import { hasDisplay, resultDisplay, summaryData } from "../viewData";

// One call of each tool with a View (backend/scripts/generate_view_fixtures.py). The
// full result carries the same card data the View gets, built once on the server.

const analysis = fixture.analyze_roth_conversions;
const asResult = (r: unknown) => r as OptimizationResult;

describe("resultDisplay", () => {
  const result = asResult(analysis.result);

  it("hands the card the server's data, under the web app's id for the result", () => {
    const display = resultDisplay("run-1", result)!;
    expect(isResultCardData(display.data)).toBe(true);
    expect(analysis.structured_content).toMatchObject({
      ...display.data,
      result_id: analysis.result_id,
    });
    expect(display.data.result_id).toBe("run-1");
    expect(display.details).toEqual(analysis.view_meta);
  });

  it("is null for a result stored before the server sent display data", () => {
    const { display: _display, ...old } = result;
    expect(hasDisplay(old as OptimizationResult)).toBe(false);
    expect(resultDisplay("run-1", old as OptimizationResult)).toBeNull();
  });
});

it("summary data from a draft has the prepare_scenario shape", () => {
  const recorded = fixture.prepare_scenario.structured_content;
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
