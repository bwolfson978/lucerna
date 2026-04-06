import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IncomeTimelineEditor } from "../IncomeTimelineEditor";
import type { YearlyIncome } from "@/lib/types";

describe("IncomeTimelineEditor", () => {
  const baseTimeline: YearlyIncome[] = [
    { year: 2026, gross_income: 100000, life_event: "none" },
    { year: 2027, gross_income: 103000, life_event: "none" },
    { year: 2028, gross_income: 106090, life_event: "none" },
  ];

  /** Click the collapsible trigger to expand the section */
  const expand = () => fireEvent.click(screen.getByText("Income timeline"));

  it("renders collapsed by default with summary info", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
    );
    expect(screen.queryByText(/Enter your expected income/)).not.toBeInTheDocument();
    expect(screen.getByText(/click to edit/)).toBeInTheDocument();
    expect(screen.getByText(/3 yrs/)).toBeInTheDocument();
    expect(screen.queryByText(/total/)).not.toBeInTheDocument();
  });

  it("renders a card for each year in the timeline when expanded", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
    );
    expand();
    // 3 years × 2 buttons each (mobile + desktop) = 6
    expect(screen.getAllByLabelText(/Remove year/)).toHaveLength(6);
  });

  it("displays the header and description when expanded", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
    );
    expect(screen.getByText("Income timeline")).toBeInTheDocument();
    expand();
    expect(
      screen.getByText(/Enter your expected income/)
    ).toBeInTheDocument();
  });

  it("shows custom description when provided", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor
        timeline={baseTimeline}
        onChange={onChange}
        description="Custom description text"
      />
    );
    expand();
    expect(screen.getByText("Custom description text")).toBeInTheDocument();
  });

  it("calls onChange with new year when + Add year is clicked", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
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
    const maxTimeline: YearlyIncome[] = Array.from({ length: 15 }, (_, i) => ({
      year: 2026 + i,
      gross_income: 100000,
      life_event: "none" as const,
    }));

    render(
      <IncomeTimelineEditor timeline={maxTimeline} onChange={onChange} />
    );

    const addButton = screen.getByText("+ Add year");
    expect(addButton).toBeDisabled();
  });

  it("calls onChange to remove a year when X is clicked", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
    );
    expand();

    // Use desktop remove buttons (hidden sm:flex); they come after mobile ones in DOM
    const removeButtons = screen.getAllByLabelText(/Remove year 2027/);
    fireEvent.click(removeButtons[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const newTrajectory = onChange.mock.calls[0][0];
    expect(newTrajectory).toHaveLength(2);
    expect(newTrajectory[0].year).toBe(2026);
    expect(newTrajectory[1].year).toBe(2028);
  });

  it("does not show remove buttons for single-year timeline", () => {
    const onChange = vi.fn();
    const singleYear: YearlyIncome[] = [
      { year: 2026, gross_income: 100000, life_event: "none" },
    ];

    render(
      <IncomeTimelineEditor timeline={singleYear} onChange={onChange} />
    );
    expand();

    expect(screen.queryByLabelText(/Remove year/)).not.toBeInTheDocument();
  });

  it("shows reset button when onReset prop is provided", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <IncomeTimelineEditor
        timeline={baseTimeline}
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
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
    );

    expect(screen.queryByText("Reset to defaults")).not.toBeInTheDocument();
  });

  it("displays income bar previews with formatted currency", () => {
    const onChange = vi.fn();
    render(
      <IncomeTimelineEditor timeline={baseTimeline} onChange={onChange} />
    );
    expand();

    // Check that currency values are displayed
    expect(screen.getByText("$100,000")).toBeInTheDocument();
    expect(screen.getByText("$103,000")).toBeInTheDocument();
    expect(screen.getByText("$106,090")).toBeInTheDocument();
  });
});
