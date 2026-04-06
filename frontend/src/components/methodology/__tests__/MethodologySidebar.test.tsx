import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MethodologyProvider } from "../MethodologyContext";
import { MethodologySidebar } from "../MethodologySidebar";
import { InfoTrigger } from "../InfoTrigger";
import { HowItWorksButton } from "../HowItWorksButton";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MethodologyProvider>{ui}</MethodologyProvider>
    </TooltipProvider>
  );
}

describe("MethodologySidebar", () => {
  it("renders sidebar content when opened", () => {
    renderWithProviders(
      <>
        <HowItWorksButton />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How does it work?"));
    expect(screen.getByText("How It Works")).toBeInTheDocument();
  });

  it("shows all accordion section titles when opened", () => {
    renderWithProviders(
      <>
        <HowItWorksButton />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How does it work?"));
    expect(screen.getByText("Your Savings Number")).toBeInTheDocument();
    expect(screen.getByText("Tax Bracket Filling")).toBeInTheDocument();
    expect(screen.getByText("The Conversion Trade-Off")).toBeInTheDocument();
    expect(screen.getByText("Multi-Year Allocation")).toBeInTheDocument();
    expect(screen.getByText("Assumptions & Limitations")).toBeInTheDocument();
  });

  it("does not show context badge when opened from header button", () => {
    renderWithProviders(
      <>
        <HowItWorksButton />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How does it work?"));
    expect(screen.queryByText(/Jumped to/)).not.toBeInTheDocument();
  });

  it("shows context badge when opened from InfoTrigger", () => {
    renderWithProviders(
      <>
        <InfoTrigger
          label="How is this calculated?"
          sectionId="savings-number"
          triggerId="hero-savings"
        />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How is this calculated?"));
    expect(screen.getByText("Jumped to: Your Savings Number")).toBeInTheDocument();
  });

  it("closes when close button is clicked", () => {
    renderWithProviders(
      <>
        <HowItWorksButton />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How does it work?"));
    expect(screen.getByText("How It Works")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close methodology sidebar"));
    // After close, the sidebar content is still in DOM (inline mode) but context resets
    expect(screen.queryByText(/Jumped to/)).not.toBeInTheDocument();
  });

  it("closes when Escape key is pressed", () => {
    renderWithProviders(
      <>
        <HowItWorksButton />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How does it work?"));
    fireEvent.keyDown(document, { key: "Escape" });
    // HowItWorksButton should no longer show active state
    const btn = screen.getByText("How does it work?").closest("button")!;
    expect(btn.className).not.toContain("bg-accent");
  });

  it("expands correct section when triggered from InfoTrigger", () => {
    renderWithProviders(
      <>
        <InfoTrigger
          label="Why these brackets?"
          sectionId="bracket-filling"
          triggerId="bracket-chart"
        />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("Why these brackets?"));
    const bracketButton = screen.getByText("Tax Bracket Filling");
    expect(bracketButton.closest("button")).toHaveAttribute("data-state", "open");
  });

  it("is hidden by default", () => {
    renderWithProviders(<MethodologySidebar />);
    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("translate-x-full");
  });

  it("opens when triggered", () => {
    renderWithProviders(
      <>
        <HowItWorksButton />
        <MethodologySidebar />
      </>
    );
    fireEvent.click(screen.getByText("How does it work?"));
    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("translate-x-0");
  });
});

describe("InfoTrigger", () => {
  it("renders label text", () => {
    renderWithProviders(
      <InfoTrigger
        label="Test label"
        sectionId="test"
        triggerId="test-trigger"
      />
    );
    expect(screen.getByText("Test label")).toBeInTheDocument();
  });

  it("has active styling when its trigger is active", () => {
    renderWithProviders(
      <>
        <InfoTrigger
          label="Click me"
          sectionId="savings-number"
          triggerId="my-trigger"
        />
        <MethodologySidebar />
      </>
    );
    const btn = screen.getByText("Click me");
    fireEvent.click(btn);
    expect(btn.closest("button")!.className).toContain("text-accent");
  });
});

describe("HowItWorksButton", () => {
  it("renders nothing outside MethodologyProvider", () => {
    const { container } = render(
      <TooltipProvider>
        <HowItWorksButton />
      </TooltipProvider>
    );
    expect(container.textContent).toBe("");
  });

  it("renders inside MethodologyProvider", () => {
    renderWithProviders(<HowItWorksButton />);
    expect(screen.getByText("How does it work?")).toBeInTheDocument();
  });
});
