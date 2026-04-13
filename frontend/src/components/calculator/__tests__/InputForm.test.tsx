import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InputForm } from "../InputForm";

// Radix UI Switch uses ResizeObserver which jsdom doesn't provide
// jsdom also doesn't implement scrollIntoView — the form uses it to jump to
// the first invalid field on submit failure. matchMedia is also missing and
// the scroll helper reads prefers-reduced-motion.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }
  // Run requestAnimationFrame callbacks synchronously so focus/scroll
  // assertions can run immediately after fireEvent.click.
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
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

    // Both required fields start as null and should show their own error
    expect(
      screen.getByText("Enter your current income")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter your traditional IRA/401(k) balance")
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not pre-fill required fields with zero", () => {
    renderInputForm({ onSubmit });

    const incomeInput = screen.getByLabelText(
      "Current income"
    ) as HTMLInputElement;
    const balanceInput = screen.getByLabelText(
      "Traditional IRA/401(k) balance"
    ) as HTMLInputElement;

    expect(incomeInput.value).toBe("");
    expect(balanceInput.value).toBe("");
    expect(incomeInput.placeholder).toMatch(/^e\.g\./);
    expect(balanceInput.placeholder).toMatch(/^e\.g\./);
  });

  it("marks required fields with an asterisk and omits it for optional fields", () => {
    renderInputForm({ onSubmit });

    // Helper: find the required indicator sibling adjacent to the given label
    function hasRequiredIndicator(labelText: string): boolean {
      const labelEl = screen.getByText(labelText);
      const wrapper = labelEl.parentElement;
      return !!wrapper?.querySelector("[data-required-indicator]");
    }

    // Required: Current income and Traditional IRA/401(k) balance
    expect(hasRequiredIndicator("Current income")).toBe(true);
    expect(hasRequiredIndicator("Traditional IRA/401(k) balance")).toBe(true);

    // Optional: Roth balance should NOT have an asterisk
    expect(hasRequiredIndicator("Roth IRA/401(k) balance")).toBe(false);
  });

  it("focuses first invalid field on submit failure", () => {
    const scrollMock = HTMLElement.prototype.scrollIntoView as ReturnType<
      typeof vi.fn
    >;
    scrollMock.mockClear();
    renderInputForm({ onSubmit });

    const submit = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(submit);

    // Current income is the first invalid field in DOM order
    const incomeInput = screen.getByLabelText("Current income");
    expect(document.activeElement).toBe(incomeInput);
    expect(scrollMock).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("focuses traditional balance when income is the only valid field", () => {
    renderInputForm({ onSubmit });

    // Fill just income — traditional balance should be the next invalid field
    const incomeInput = screen.getByLabelText("Current income");
    fireEvent.change(incomeInput, { target: { value: "85000" } });

    const submit = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(submit);

    const balanceInput = screen.getByLabelText(
      "Traditional IRA/401(k) balance"
    );
    expect(document.activeElement).toBe(balanceInput);
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

    // Should generate a timeline (up to 8 years: 73 - 65)
    expect(screen.getByTestId("timeline-editor")).toBeInTheDocument();
    expect(Number(screen.getByTestId("timeline-count").textContent)).toBe(8);
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

    // Should generate timeline (3 years: 73 - 70)
    expect(Number(screen.getByTestId("timeline-count").textContent)).toBe(3);

    // Should submit successfully
    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const input = onSubmit.mock.calls[0][0];
    expect(input.retirement_age).toBe(65);
    expect(input.age).toBe(70);
    expect(input.income_timeline.length).toBe(3);
  });
});
