import { fireEvent, render, within } from "@testing-library/react";
import { ResultCard } from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";
import { resultCardData, resultDetails } from "@/lib/results/viewData";
import fixture from "../../../../../shared/fixtures/view-data.json";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { ResultsView } from "../ResultsView";

// The chat result card (web, Claude, ChatGPT) and the full results page show the same
// analysis. Each works its numbers out on its own, so this renders both from one engine
// result (a California scenario, so state tax counts) and reads what a person would see.

const result = fixture.analyze_roth_conversions.result as unknown as OptimizationResult;

/** The savings headline, Converted / Tax cost / Years, and each year's Convert and Tax row. */
function shown(root: HTMLElement) {
  const stat = (label: string) =>
    within(root)
      .getByText(label, { selector: ".metric-label" })
      .parentElement!.querySelector('[data-ui="stat-value"]')!.textContent;
  const row = (name: string) =>
    Array.from(root.querySelectorAll(`[data-ui="row-${name}"] > div`)).map((cell) =>
      Math.round(Number(cell.getAttribute("data-value") ?? 0))
    );
  return {
    savings: root.querySelector(".metric-value-hero")!.textContent,
    converted: stat("Converted"),
    taxCost: stat("Tax cost"),
    years: stat("Years"),
    convert: row("convert"),
    tax: row("tax"),
  };
}

const card = () =>
  render(
    <ResultCard
      data={resultCardData("r1", result)}
      details={resultDetails(result)}
      onOpenFullResults={() => {}}
    />
  ).container;
const full = () =>
  render(
    <MethodologyProvider>
      <ResultsView result={result} />
    </MethodologyProvider>
  ).container;

const slide = (root: HTMLElement, total: number) =>
  fireEvent.change(within(root).getByLabelText("Total amount to convert"), {
    target: { value: String(total) },
  });

// jsdom has no scrolling; the full results page scrolls its chart as bars appear.
beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

describe("chat result card and full results agree", () => {
  it("at the most savings", () => {
    const a = shown(card());
    const b = shown(full());
    expect(a).toEqual(b);
    // The years add up to the total tax, give or take rounding.
    const taxTotal = Number(a.taxCost!.replace(/[$,]/g, ""));
    expect(Math.abs(a.tax.reduce((s, t) => s + t, 0) - taxTotal)).toBeLessThanOrEqual(a.tax.length);
  });

  it.each([0.25, 0.6, 0.9])("with the slider moved to %s of the balance", (share) => {
    const total = Math.round((result.input.traditional_ira_balance * share) / 100) * 100;
    const a = card();
    const b = full();
    slide(a, total);
    slide(b, total);
    expect(shown(a)).toEqual(shown(b));
  });
});
