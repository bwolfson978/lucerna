import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("ranks strategies: best first, worst last", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    const rows = within(screen.getByTestId("scenario-list")).getAllByRole("listitem");
    expect(rows.map((row) => row.firstElementChild?.firstElementChild?.textContent)).toEqual([
      "Highest estimated savings",
      "Full conversion (year 1)",
      "No conversion",
    ]);
  });

  it("shows each strategy's estimated savings, conversion and tax", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.getByText("Estimated savings")).toBeInTheDocument();
    expect(screen.getByText("$30,000")).toBeInTheDocument();
    expect(screen.getByText("$10,000")).toBeInTheDocument();
    expect(screen.getByText(/Convert \$120K · Tax \$18,000/)).toBeInTheDocument();
    expect(screen.getByText(/Convert \$210K · Tax \$48,000/)).toBeInTheDocument();
  });

  it("does not display 'Recommended' or 'optimal' text", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText(/vs\. optimal/)).not.toBeInTheDocument();
  });

  it("shows how far each other strategy falls short of the highest savings", () => {
    renderWithProviders(<ScenarioCards scenarios={mockScenarios} />);
    expect(screen.getByText(/\u2212\$30,000/)).toBeInTheDocument();
    expect(screen.getByText(/\u2212\$20,000/)).toBeInTheDocument();
    expect(screen.getAllByText(/vs\. highest/)).toHaveLength(2);
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
