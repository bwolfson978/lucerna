import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScenarioCards } from "../ScenarioCards";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    tax_on_conversion: 45000,
    difference_from_optimal: -20000,
    estimated_savings: 10000,
    yearly_conversions: [210000, 0, 0],
    years: [2026, 2027, 2028],
  },
];

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("ScenarioCards", () => {
  it("renders all scenario labels", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.getByText("No conversion")).toBeInTheDocument();
    // "Highest estimated savings" appears both as label and badge
    expect(screen.getAllByText("Highest estimated savings").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Full conversion (year 1)")).toBeInTheDocument();
  });

  it("shows estimated savings for each scenario", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    const savingsLabels = screen.getAllByText("Estimated savings");
    expect(savingsLabels).toHaveLength(3);
  });

  it("shows per-year conversion schedule", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.getAllByText("2026").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("2027").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("2028").length).toBeGreaterThanOrEqual(3);
  });

  it("does not display 'Recommended' or 'optimal' text", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText(/vs\. optimal/)).not.toBeInTheDocument();
  });

  it("shows difference for non-best scenarios", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    const differenceLabels = screen.getAllByText("Difference");
    expect(differenceLabels).toHaveLength(2);
  });

  it("returns null when scenarios is empty", () => {
    const { container } = renderWithProviders(
      <ScenarioCards scenarios={[]} />
    );
    expect(container.textContent).toBe("");
  });
});
