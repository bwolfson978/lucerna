import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InputForm } from "../InputForm";

// Radix UI Switch uses ResizeObserver which jsdom doesn't provide
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// Mock IncomeTimelineEditor to simplify testing and avoid deep rendering
vi.mock("../IncomeTimelineEditor", () => ({
  IncomeTimelineEditor: ({
    timeline,
    onChange,
    onReset,
    description,
  }: {
    timeline: { year: number; gross_income: number; notes?: string }[];
    onChange: (t: typeof timeline) => void;
    onReset?: () => void;
    description?: string;
  }) => (
    <div data-testid="timeline-editor">
      <span data-testid="timeline-count">{timeline.length}</span>
      <span data-testid="timeline-description">{description}</span>
      {timeline.map((y) => (
        <div key={y.year} data-testid={`year-${y.year}`}>
          {y.gross_income} - {y.notes || ""}
        </div>
      ))}
      <button
        data-testid="simulate-edit-notes"
        onClick={() => {
          const updated = timeline.map((y, i) =>
            i === 1 ? { ...y, notes: "Sabbatical", gross_income: 40000 } : y
          );
          onChange(updated);
        }}
      >
        Edit notes
      </button>
      {onReset && (
        <button data-testid="reset-button" onClick={onReset}>
          Reset
        </button>
      )}
    </div>
  ),
}));

function renderInputForm(props: { onSubmit: ReturnType<typeof vi.fn>; loading?: boolean }) {
  return render(
    <TooltipProvider>
      <InputForm {...props} />
    </TooltipProvider>
  );
}

describe("InputForm", () => {
  let onSubmit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmit = vi.fn();
  });

  function fillBasicInputs() {
    // The form has default age=35, retirementAge=65, incomeGrowthRate=3
    // We just need to set income and balance
    const incomeInput = screen.getByLabelText("Current income");
    fireEvent.change(incomeInput, { target: { value: "100000" } });

    const balanceInput = screen.getByLabelText("Traditional IRA/401(k) balance");
    fireEvent.change(balanceInput, { target: { value: "500000" } });
  }

  it("renders without timeline editor when income is 0", () => {
    renderInputForm({ onSubmit });
    expect(screen.queryByTestId("timeline-editor")).not.toBeInTheDocument();
  });

  it("shows timeline editor when income is entered", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    expect(screen.getByTestId("timeline-editor")).toBeInTheDocument();
  });

  it("generates correct number of timeline years from age and retirement age", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    // Default age=35, retirement=65 → 30 years
    expect(screen.getByTestId("timeline-count").textContent).toBe("30");
  });

  it("shows description text on the timeline editor", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    expect(screen.getByTestId("timeline-description").textContent).toContain(
      "Projected from your inputs above"
    );
  });

  it("does not show reset button when no customizations are set", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    expect(screen.queryByTestId("reset-button")).not.toBeInTheDocument();
  });

  it("shows reset button after notes are added", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Simulate user editing a year with notes
    fireEvent.click(screen.getByTestId("simulate-edit-notes"));

    expect(screen.getByTestId("reset-button")).toBeInTheDocument();
  });

  it("reset button clears customizations", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Add notes
    fireEvent.click(screen.getByTestId("simulate-edit-notes"));
    expect(screen.getByTestId("reset-button")).toBeInTheDocument();

    // Click reset
    fireEvent.click(screen.getByTestId("reset-button"));

    // Reset button should disappear since no more customizations
    expect(screen.queryByTestId("reset-button")).not.toBeInTheDocument();
  });

  it("submits with timeline data", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0];
    expect(input.income_timeline).toBeDefined();
    expect(input.income_timeline.length).toBe(30);
    expect(input.income_timeline[0].gross_income).toBe(100000);
  });

  it("submits with custom notes in timeline", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Add notes on year index 1
    fireEvent.click(screen.getByTestId("simulate-edit-notes"));

    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);

    expect(onSubmit).toHaveBeenCalled();
    // Get the last call (after editing)
    const lastCall = onSubmit.mock.calls[onSubmit.mock.calls.length - 1][0];
    expect(lastCall.income_timeline[1].notes).toBe("Sabbatical");
    expect(lastCall.income_timeline[1].gross_income).toBe(40000);
  });

  it("preserves notes when income changes", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Add notes
    fireEvent.click(screen.getByTestId("simulate-edit-notes"));

    // Change income — should regenerate but preserve pinned year
    const incomeInput = screen.getByLabelText("Current income");
    fireEvent.change(incomeInput, { target: { value: "120000" } });

    // The year with notes should still show notes
    const currentYear = new Date().getFullYear();
    const pinnedYear = screen.getByTestId(`year-${currentYear + 1}`);
    expect(pinnedYear.textContent).toContain("Sabbatical");
    expect(pinnedYear.textContent).toContain("40000");
  });

  it("validates required fields before submitting", () => {
    renderInputForm({ onSubmit });

    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);

    // Should show balance error (0 is invalid)
    expect(
      screen.getByText("Enter your traditional IRA/401(k) balance")
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
