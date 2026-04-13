import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioCards } from "../ScenarioCards";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import type { ScenarioComparison } from "@/lib/types";

const mockScenarios: ScenarioComparison[] = [
  {
    label: "No conversion",
    conversion_amount: 0,
    npv: 500000,
    tax_on_conversion: 0,
    difference_from_optimal: -30000,
    estimated_savings: 0,
    yearly_conversions: [0, 0, 0],
    years: [2026, 2027, 2028],
  },
  {
    label: "Highest estimated savings",
    conversion_amount: 120000,
    npv: 530000,
    tax_on_conversion: 18000,
    difference_from_optimal: 0,
    estimated_savings: 30000,
    yearly_conversions: [50000, 45000, 25000],
    years: [2026, 2027, 2028],
  },
  {
    label: "Full conversion (year 1)",
    conversion_amount: 210000,
    npv: 510000,
    tax_on_conversion: 48000,
    difference_from_optimal: -20000,
    estimated_savings: 10000,
    yearly_conversions: [210000, 0, 0],
    years: [2026, 2027, 2028],
  },
];

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MethodologyProvider>{ui}</MethodologyProvider>
    </TooltipProvider>
  );
}

describe("ScenarioCards", () => {
  it("renders all scenario labels", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.getByText("No conversion")).toBeInTheDocument();
    expect(screen.getByText("Highest estimated savings")).toBeInTheDocument();
    expect(screen.getByText("Full conversion (year 1)")).toBeInTheDocument();
  });

  it("reorders cards: non-best first, best last", () => {
    const { container } = renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    // Cards are inside the grid; each card's first span.text-h3 is its title
    const grid = container.querySelector(".grid");
    const cards = grid!.querySelectorAll(":scope > div");
    const labels = Array.from(cards).map((card) => card.querySelector(".text-h3")?.textContent);
    expect(labels[0]).toBe("No conversion");
    expect(labels[1]).toBe("Full conversion (year 1)");
    expect(labels[2]).toBe("Highest estimated savings");
  });

  it("shows estimated savings when provided", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    const savingsLabels = screen.getAllByText("Estimated savings");
    expect(savingsLabels).toHaveLength(3);
  });

  it("shows per-year conversion schedule for multi-year scenario", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    const scheduleHeaders = screen.getAllByText("Roth conversion schedule");
    expect(scheduleHeaders.length).toBeGreaterThanOrEqual(1);
    // The best scenario shows per-year amounts
    expect(screen.getByText("$50,000")).toBeInTheDocument();
    expect(screen.getByText("$45,000")).toBeInTheDocument();
    expect(screen.getByText("$25,000")).toBeInTheDocument();
  });

  it("does not display 'Recommended' or 'optimal' text", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText(/vs\. optimal/)).not.toBeInTheDocument();
  });

  it("shows impact on wealth for non-best scenarios", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    const impactLabels = screen.getAllByText("Impact on long-term wealth");
    expect(impactLabels).toHaveLength(2);
    expect(screen.getAllByText(/less than scenario with highest savings/)).toHaveLength(2);
  });

  it("returns null when scenarios is empty", () => {
    const { container } = renderWithProviders(<ScenarioCards scenarios={[]} />);
    expect(container.textContent).toBe("");
  });

  it("hides estimated savings row when field is missing", () => {
    const legacyScenarios: ScenarioComparison[] = [
      {
        label: "No conversion",
        conversion_amount: 0,
        npv: 500000,
        tax_on_conversion: 0,
        difference_from_optimal: -30000,
      },
      {
        label: "Optimal",
        conversion_amount: 95000,
        npv: 530000,
        tax_on_conversion: 14200,
        difference_from_optimal: 0,
      },
    ];
    renderWithProviders(<ScenarioCards scenarios={legacyScenarios} />);
    // No estimated savings row when field is absent
    expect(screen.queryByText("Estimated savings")).not.toBeInTheDocument();
    expect(screen.queryByText("$NaN")).not.toBeInTheDocument();
  });

  it("replaces 'Optimal' label from old backends", () => {
    const legacyScenarios: ScenarioComparison[] = [
      {
        label: "Optimal conversion",
        conversion_amount: 95000,
        npv: 530000,
        tax_on_conversion: 14200,
        difference_from_optimal: 0,
      },
    ];
    renderWithProviders(<ScenarioCards scenarios={legacyScenarios} />);
    expect(screen.queryByText("Optimal conversion")).not.toBeInTheDocument();
    expect(screen.getByText("Highest estimated savings")).toBeInTheDocument();
  });
});
