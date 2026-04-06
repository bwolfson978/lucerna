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

// Mock IncomeTrajectoryEditor to simplify testing and avoid deep rendering
vi.mock("../IncomeTrajectoryEditor", () => ({
  IncomeTrajectoryEditor: ({
    trajectory,
    onChange,
    onReset,
    description,
  }: {
    trajectory: { year: number; gross_income: number; life_event: string }[];
    onChange: (t: typeof trajectory) => void;
    onReset?: () => void;
    description?: string;
  }) => (
    <div data-testid="trajectory-editor">
      <span data-testid="trajectory-count">{trajectory.length}</span>
      <span data-testid="trajectory-description">{description}</span>
      {trajectory.map((y) => (
        <div key={y.year} data-testid={`year-${y.year}`}>
          {y.gross_income} - {y.life_event}
        </div>
      ))}
      <button
        data-testid="simulate-edit-life-event"
        onClick={() => {
          const updated = trajectory.map((y, i) =>
            i === 1 ? { ...y, life_event: "sabbatical", gross_income: 40000 } : y
          );
          onChange(updated);
        }}
      >
        Edit life event
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

  it("renders without trajectory editor when income is 0", () => {
    renderInputForm({ onSubmit });
    expect(screen.queryByTestId("trajectory-editor")).not.toBeInTheDocument();
  });

  it("shows trajectory editor when income is entered", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    expect(screen.getByTestId("trajectory-editor")).toBeInTheDocument();
  });

  it("generates correct number of trajectory years from age and retirement age", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    // Default age=35, retirement=65 → 30 years
    expect(screen.getByTestId("trajectory-count").textContent).toBe("30");
  });

  it("shows description text on the trajectory editor", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    expect(screen.getByTestId("trajectory-description").textContent).toContain(
      "Projected from your inputs above"
    );
  });

  it("does not show reset button when no life events are set", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();
    expect(screen.queryByTestId("reset-button")).not.toBeInTheDocument();
  });

  it("shows reset button after a life event is set", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Simulate user editing a year with a life event
    fireEvent.click(screen.getByTestId("simulate-edit-life-event"));

    expect(screen.getByTestId("reset-button")).toBeInTheDocument();
  });

  it("reset button clears life events", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Set a life event
    fireEvent.click(screen.getByTestId("simulate-edit-life-event"));
    expect(screen.getByTestId("reset-button")).toBeInTheDocument();

    // Click reset
    fireEvent.click(screen.getByTestId("reset-button"));

    // Reset button should disappear since no more life events
    expect(screen.queryByTestId("reset-button")).not.toBeInTheDocument();
  });

  it("submits with trajectory data", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0];
    expect(input.income_trajectory).toBeDefined();
    expect(input.income_trajectory.length).toBe(30);
    expect(input.income_trajectory[0].gross_income).toBe(100000);
  });

  it("submits with custom life events in trajectory", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Set a life event on year index 1
    fireEvent.click(screen.getByTestId("simulate-edit-life-event"));

    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);

    expect(onSubmit).toHaveBeenCalled();
    // Get the last call (after editing)
    const lastCall = onSubmit.mock.calls[onSubmit.mock.calls.length - 1][0];
    expect(lastCall.income_trajectory[1].life_event).toBe("sabbatical");
    expect(lastCall.income_trajectory[1].gross_income).toBe(40000);
  });

  it("preserves life events when income changes", () => {
    renderInputForm({ onSubmit });
    fillBasicInputs();

    // Set a life event
    fireEvent.click(screen.getByTestId("simulate-edit-life-event"));

    // Change income — should regenerate but preserve pinned year
    const incomeInput = screen.getByLabelText("Current income");
    fireEvent.change(incomeInput, { target: { value: "120000" } });

    // The year with sabbatical life event should still show sabbatical
    const currentYear = new Date().getFullYear();
    const pinnedYear = screen.getByTestId(`year-${currentYear + 1}`);
    expect(pinnedYear.textContent).toContain("sabbatical");
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

  it("allows retirement age equal to current age (already retired)", () => {
    renderInputForm({ onSubmit });

    const ageInput = screen.getByLabelText("Age");
    fireEvent.change(ageInput, { target: { value: "65" } });

    const retInput = screen.getByLabelText("Retirement age");
    fireEvent.change(retInput, { target: { value: "65" } });

    const incomeInput = screen.getByLabelText("Current income");
    fireEvent.change(incomeInput, { target: { value: "50000" } });

    const balanceInput = screen.getByLabelText("Traditional IRA/401(k) balance");
    fireEvent.change(balanceInput, { target: { value: "500000" } });

    // Should NOT show the old validation error
    expect(
      screen.queryByText("Retirement age must be greater than current age")
    ).not.toBeInTheDocument();

    // Should generate a trajectory (up to 8 years: 73 - 65)
    expect(screen.getByTestId("trajectory-editor")).toBeInTheDocument();
    expect(Number(screen.getByTestId("trajectory-count").textContent)).toBe(8);
  });

  it("allows retirement age less than current age and submits", () => {
    renderInputForm({ onSubmit });

    const ageInput = screen.getByLabelText("Age");
    fireEvent.change(ageInput, { target: { value: "70" } });

    const retInput = screen.getByLabelText("Retirement age");
    fireEvent.change(retInput, { target: { value: "65" } });

    const incomeInput = screen.getByLabelText("Current income");
    fireEvent.change(incomeInput, { target: { value: "50000" } });

    const balanceInput = screen.getByLabelText("Traditional IRA/401(k) balance");
    fireEvent.change(balanceInput, { target: { value: "500000" } });

    // Should generate trajectory (3 years: 73 - 70)
    expect(Number(screen.getByTestId("trajectory-count").textContent)).toBe(3);

    // Should submit successfully
    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const input = onSubmit.mock.calls[0][0];
    expect(input.retirement_age).toBe(65);
    expect(input.age).toBe(70);
    expect(input.income_trajectory.length).toBe(3);
  });
});
