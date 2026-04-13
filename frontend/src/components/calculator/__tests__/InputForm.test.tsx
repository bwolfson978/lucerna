import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { forwardRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InputForm } from "../InputForm";

// Mock the Radix-backed Select with a native <select> so fireEvent.change
// drives it directly and tests don't have to deal with portal rendering.
// This still exercises the FormSelect wrapper (label, required asterisk,
// error text) since only the innermost UI Select is replaced.
interface MockSelectProps {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}
vi.mock("@/components/ui/select", () => {
  const MockSelect = forwardRef<HTMLSelectElement, MockSelectProps>(
    ({ options, value, onChange, id, placeholder, ...rest }, ref) => (
      <select
        ref={ref}
        id={id}
        value={value ?? ""}
        aria-required={rest["aria-required"] || undefined}
        aria-invalid={rest["aria-invalid"] || undefined}
        onChange={(e) => onChange?.({ target: { value: e.target.value } })}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  );
  MockSelect.displayName = "MockSelect";
  return { Select: MockSelect };
});

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

  // All five Tier-1 required fields start empty in the real form — tests
  // must populate every one to get through validation.
  function fillBasicInputs() {
    fireEvent.change(screen.getByLabelText("Age"), {
      target: { value: "35" },
    });
    fireEvent.change(screen.getByLabelText("Filing status"), {
      target: { value: "single" },
    });
    fireEvent.change(screen.getByLabelText("Current income"), {
      target: { value: "100000" },
    });
    fireEvent.change(screen.getByLabelText("Traditional IRA/401(k) balance"), {
      target: { value: "500000" },
    });
    fireEvent.change(screen.getByLabelText("Retirement age"), {
      target: { value: "65" },
    });
  }

  it("renders without timeline editor when required fields are empty", () => {
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

  it("validates all required fields before submitting", () => {
    renderInputForm({ onSubmit });

    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);

    // All five Tier-1 required fields should flag their own error
    expect(screen.getByText("Enter your age")).toBeInTheDocument();
    expect(screen.getByText("Select your filing status")).toBeInTheDocument();
    expect(screen.getByText("Enter your current income")).toBeInTheDocument();
    expect(screen.getByText("Enter your traditional IRA/401(k) balance")).toBeInTheDocument();
    expect(screen.getByText("Enter your retirement age")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not pre-fill required personal-data fields", () => {
    renderInputForm({ onSubmit });

    const age = screen.getByLabelText("Age") as HTMLInputElement;
    const filing = screen.getByLabelText("Filing status") as HTMLSelectElement;
    const income = screen.getByLabelText("Current income") as HTMLInputElement;
    const balance = screen.getByLabelText("Traditional IRA/401(k) balance") as HTMLInputElement;
    const retAge = screen.getByLabelText("Retirement age") as HTMLInputElement;

    expect(age.value).toBe("");
    expect(filing.value).toBe("");
    expect(income.value).toBe("");
    expect(balance.value).toBe("");
    expect(retAge.value).toBe("");
    expect(age.placeholder).toMatch(/^e\.g\./);
    expect(income.placeholder).toMatch(/^e\.g\./);
    expect(balance.placeholder).toMatch(/^e\.g\./);
    expect(retAge.placeholder).toMatch(/^e\.g\./);
  });

  it("pre-fills assumption fields with sensible defaults", () => {
    renderInputForm({ onSubmit });

    // Tier 2 — industry-standard assumptions users don't need to know
    const growth = screen.getByLabelText("Income growth rate (%)") as HTMLInputElement;
    expect(growth.value).toBe("3");
  });

  it("marks Tier-1 fields with an asterisk and omits it for optional fields", () => {
    renderInputForm({ onSubmit });

    // Helper: find the required indicator sibling adjacent to the given label
    function hasRequiredIndicator(labelText: string): boolean {
      const labelEl = screen.getByText(labelText);
      const wrapper = labelEl.parentElement;
      return !!wrapper?.querySelector("[data-required-indicator]");
    }

    // Tier 1 — personal data the user must supply
    expect(hasRequiredIndicator("Age")).toBe(true);
    expect(hasRequiredIndicator("Filing status")).toBe(true);
    expect(hasRequiredIndicator("Current income")).toBe(true);
    expect(hasRequiredIndicator("Traditional IRA/401(k) balance")).toBe(true);
    expect(hasRequiredIndicator("Retirement age")).toBe(true);

    // Tier 3 — optional
    expect(hasRequiredIndicator("Roth IRA/401(k) balance")).toBe(false);
    // Tier 2 — assumption with default
    expect(hasRequiredIndicator("Income growth rate (%)")).toBe(false);
  });

  it("focuses first invalid field on submit failure", () => {
    const scrollMock = HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    scrollMock.mockClear();
    renderInputForm({ onSubmit });

    const submit = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(submit);

    // Age is the first invalid field in DOM order
    const ageInput = screen.getByLabelText("Age");
    expect(document.activeElement).toBe(ageInput);
    expect(scrollMock).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("advances focus to the next invalid field as earlier ones are filled", () => {
    renderInputForm({ onSubmit });

    // Fill age only — filing status should be next invalid
    fireEvent.change(screen.getByLabelText("Age"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run my scenario/i }));
    expect(document.activeElement).toBe(screen.getByLabelText("Filing status"));

    // Then filing status — current income should be next
    fireEvent.change(screen.getByLabelText("Filing status"), {
      target: { value: "single" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run my scenario/i }));
    expect(document.activeElement).toBe(screen.getByLabelText("Current income"));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("allows retirement age equal to current age (already retired)", () => {
    renderInputForm({ onSubmit });

    fireEvent.change(screen.getByLabelText("Age"), {
      target: { value: "65" },
    });
    fireEvent.change(screen.getByLabelText("Retirement age"), {
      target: { value: "65" },
    });
    fireEvent.change(screen.getByLabelText("Current income"), {
      target: { value: "50000" },
    });
    fireEvent.change(screen.getByLabelText("Traditional IRA/401(k) balance"), {
      target: { value: "500000" },
    });

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

    fireEvent.change(screen.getByLabelText("Age"), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText("Filing status"), {
      target: { value: "single" },
    });
    fireEvent.change(screen.getByLabelText("Retirement age"), {
      target: { value: "65" },
    });
    fireEvent.change(screen.getByLabelText("Current income"), {
      target: { value: "50000" },
    });
    fireEvent.change(screen.getByLabelText("Traditional IRA/401(k) balance"), {
      target: { value: "500000" },
    });

    // Should generate timeline (3 years: 73 - 70)
    expect(Number(screen.getByTestId("timeline-count").textContent)).toBe(3);

    // Should submit successfully
    const form = screen.getByRole("button", { name: /run my scenario/i });
    fireEvent.click(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const input = onSubmit.mock.calls[0][0];
    expect(input.retirement_age).toBe(65);
    expect(input.age).toBe(70);
    expect(input.filing_status).toBe("single");
    expect(input.income_timeline.length).toBe(3);
  });
});
