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
    expect(screen.getByText("Highest estimated savings")).toBeInTheDocument();
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

  it("handles missing estimated_savings without NaN", () => {
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
    // Should render $0 for missing estimated_savings, not $NaN
    expect(screen.queryByText("$NaN")).not.toBeInTheDocument();
  });

  it("does not show 'Highest estimated savings' badge on highlighted card", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    // The card label "Highest estimated savings" should appear once as a scenario label,
    // but NOT as a badge above the card
    const matches = screen.getAllByText("Highest estimated savings");
    expect(matches).toHaveLength(1); // Only the scenario label, no badge
  });
});
