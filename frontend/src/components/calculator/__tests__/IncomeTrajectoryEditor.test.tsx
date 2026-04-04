import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IncomeTrajectoryEditor } from "../IncomeTrajectoryEditor";
import type { YearlyIncome } from "@/lib/types";

describe("IncomeTrajectoryEditor", () => {
  const baseTrajectory: YearlyIncome[] = [
    { year: 2026, gross_income: 100000, life_event: "none" },
    { year: 2027, gross_income: 103000, life_event: "none" },
    { year: 2028, gross_income: 106090, life_event: "none" },
  ];

  it("renders a card for each year in the trajectory", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor trajectory={baseTrajectory} onChange={onChange} />
    );
    expect(screen.getAllByLabelText(/Remove year/)).toHaveLength(3);
  });

  it("displays the header and description", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor trajectory={baseTrajectory} onChange={onChange} />
    );
    expect(screen.getByText("Income trajectory")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter your expected income/)
    ).toBeInTheDocument();
  });

  it("shows custom description when provided", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor
        trajectory={baseTrajectory}
        onChange={onChange}
        description="Custom description text"
      />
    );
    expect(screen.getByText("Custom description text")).toBeInTheDocument();
  });

  it("calls onChange with new year when + Add year is clicked", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor trajectory={baseTrajectory} onChange={onChange} />
    );

    fireEvent.click(screen.getByText("+ Add year"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newTrajectory = onChange.mock.calls[0][0];
    expect(newTrajectory).toHaveLength(4);
    expect(newTrajectory[3].year).toBe(2029);
    expect(newTrajectory[3].gross_income).toBe(0);
    expect(newTrajectory[3].life_event).toBe("none");
  });

  it("disables + Add year when at 15-year max", () => {
    const onChange = vi.fn();
    const maxTrajectory: YearlyIncome[] = Array.from({ length: 15 }, (_, i) => ({
      year: 2026 + i,
      gross_income: 100000,
      life_event: "none" as const,
    }));

    render(
      <IncomeTrajectoryEditor trajectory={maxTrajectory} onChange={onChange} />
    );

    const addButton = screen.getByText("+ Add year");
    expect(addButton).toBeDisabled();
  });

  it("calls onChange to remove a year when X is clicked", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor trajectory={baseTrajectory} onChange={onChange} />
    );

    const removeButtons = screen.getAllByLabelText(/Remove year/);
    fireEvent.click(removeButtons[1]); // Remove year 2027

    expect(onChange).toHaveBeenCalledTimes(1);
    const newTrajectory = onChange.mock.calls[0][0];
    expect(newTrajectory).toHaveLength(2);
    expect(newTrajectory[0].year).toBe(2026);
    expect(newTrajectory[1].year).toBe(2028);
  });

  it("does not show remove buttons for single-year trajectory", () => {
    const onChange = vi.fn();
    const singleYear: YearlyIncome[] = [
      { year: 2026, gross_income: 100000, life_event: "none" },
    ];

    render(
      <IncomeTrajectoryEditor trajectory={singleYear} onChange={onChange} />
    );

    expect(screen.queryByLabelText(/Remove year/)).not.toBeInTheDocument();
  });

  it("shows reset button when onReset prop is provided", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <IncomeTrajectoryEditor
        trajectory={baseTrajectory}
        onChange={onChange}
        onReset={onReset}
      />
    );

    const resetButton = screen.getByText("Reset to defaults");
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("does not show reset button when onReset is not provided", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor trajectory={baseTrajectory} onChange={onChange} />
    );

    expect(screen.queryByText("Reset to defaults")).not.toBeInTheDocument();
  });

  it("displays income bar previews with formatted currency", () => {
    const onChange = vi.fn();
    render(
      <IncomeTrajectoryEditor trajectory={baseTrajectory} onChange={onChange} />
    );

    // Check that currency values are displayed
    expect(screen.getByText("$100,000")).toBeInTheDocument();
    expect(screen.getByText("$103,000")).toBeInTheDocument();
    expect(screen.getByText("$106,090")).toBeInTheDocument();
  });
});
