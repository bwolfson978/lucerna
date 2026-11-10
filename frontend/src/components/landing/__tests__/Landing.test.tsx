import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeroWindowTimeline } from "../HeroWindowTimeline";
import situationResults from "../../../../../shared/fixtures/landing-situations.json";

// Reduced motion makes the landing animations jump straight to their end state.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HeroWindowTimeline", () => {
  const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

  it("starts on early retirement with the engine's savings", () => {
    render(<HeroWindowTimeline />);
    expect(screen.getByRole("button", { name: "Early retirement" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      screen.getByText(dollars(situationResults["early-retirement"].estimated_lifetime_tax_savings))
    ).toBeInTheDocument();
    expect(screen.getByText("A couple retiring at 55.")).toBeInTheDocument();
  });

  it("switches household when a situation is picked", async () => {
    render(<HeroWindowTimeline />);
    fireEvent.click(screen.getByRole("button", { name: "Career break" }));

    expect(screen.getByRole("button", { name: "Career break" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(
      await screen.findByText(
        dollars(situationResults["career-break"].estimated_lifetime_tax_savings)
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /converts between ages 44 and 45/ })
    ).toBeInTheDocument();
  });

  it("links to the calculator and the example", () => {
    render(<HeroWindowTimeline />);
    expect(screen.getByRole("link", { name: "Try your own numbers" })).toHaveAttribute(
      "href",
      "/calculator"
    );
    expect(screen.getByRole("link", { name: "See an example" })).toHaveAttribute("href", "/demo");
  });
});
