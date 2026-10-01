import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { LandingDemo } from "../LandingDemo";
import { BracketFiller } from "../BracketFiller";
import { IncomeWindowMap } from "../IncomeWindowMap";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

describe("LandingDemo", () => {
  it("shows the engine's demo schedule and headline numbers", async () => {
    render(<LandingDemo />);

    expect(await screen.findByText("2 of 2 years scheduled")).toBeInTheDocument();
    expect(screen.getAllByText("$45,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$28,500").length).toBeGreaterThan(0);
    expect(screen.getByText("2 years")).toBeInTheDocument();
    // marginal_bracket arrives as 0.22 and is shown as a percentage
    expect(screen.getAllByText("22%").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/keeping every conversion dollar at 22% or below/i)
    ).toBeInTheDocument();
  });

  it("falls back gracefully when the demo API fails", async () => {
    server.use(http.get(`${API_BASE}/api/demo`, () => new HttpResponse(null, { status: 500 })));
    render(<LandingDemo />);

    expect(await screen.findByText(/live demo is unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText("n/a")).toHaveLength(4);
  });
});

describe("BracketFiller", () => {
  it("pours a conversion up to the top of the 22% bracket on first view", async () => {
    render(<BracketFiller />);

    // $61,000 income - $32,200 deduction = $28,800 taxable; 22% tops out at $211,400
    expect(await screen.findByText("$182,600")).toBeInTheDocument();
    expect(screen.getByText("top bracket").previousSibling).toHaveTextContent("22%");
  });

  it("lets the user fill a specific bracket and switch filing status", async () => {
    render(<BracketFiller />);
    await screen.findByText("$182,600");

    fireEvent.click(screen.getByRole("button", { name: "12%" }));
    expect(screen.getByText("$72,000")).toBeInTheDocument();
    expect(screen.getByText("top bracket").previousSibling).toHaveTextContent("12%");

    fireEvent.click(screen.getByRole("button", { name: "Single" }));
    expect(screen.getByRole("button", { name: "Single" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/\$16,100 standard deduction/)).toBeInTheDocument();
  });
});

describe("IncomeWindowMap", () => {
  it("recomputes the conversion window as ages change", () => {
    render(<IncomeWindowMap />);
    expect(screen.getByText("window, age 62 to 75")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Retire at"), { target: { value: "65" } });
    expect(screen.getByText("window, age 65 to 75")).toBeInTheDocument();
    expect(screen.getAllByText("10 years").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "73" }));
    expect(screen.getByText("window, age 65 to 73")).toBeInTheDocument();
    expect(screen.getByText("born 1951 to 1959")).toBeInTheDocument();
  });
});
