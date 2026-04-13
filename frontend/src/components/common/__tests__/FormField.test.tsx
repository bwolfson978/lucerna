import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "../FormField";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe("FormField", () => {
  it("renders label and input", () => {
    renderWithProviders(<FormField label="Age" type="number" />);
    expect(screen.getByLabelText("Age")).toBeInTheDocument();
  });

  it("renders tooltip icon when tooltip prop is provided", () => {
    renderWithProviders(<FormField label="Discount rate" tooltip="Explanation text" />);
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
  });

  it("does not render tooltip icon when tooltip prop is omitted", () => {
    renderWithProviders(<FormField label="Age" />);
    expect(screen.queryByLabelText("More info")).not.toBeInTheDocument();
  });

  it("renders helper text below input", () => {
    renderWithProviders(<FormField label="Growth" helper="Annual growth assumption" />);
    expect(screen.getByText("Annual growth assumption")).toBeInTheDocument();
  });

  it("renders label, tooltip, and helper together", () => {
    renderWithProviders(
      <FormField
        label="Investment return (%)"
        helper="Expected annual return"
        tooltip="Stock-heavy: 7-8%"
      />
    );
    expect(screen.getByLabelText("Investment return (%)")).toBeInTheDocument();
    expect(screen.getByLabelText("More info")).toBeInTheDocument();
    expect(screen.getByText("Expected annual return")).toBeInTheDocument();
  });

  it("shows error instead of helper when error is present", () => {
    renderWithProviders(<FormField label="Balance" helper="Include rollovers" error="Required" />);
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.queryByText("Include rollovers")).not.toBeInTheDocument();
  });
});
