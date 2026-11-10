import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MostSavingsNote } from "@lucerna/ui";

describe("MostSavingsNote", () => {
  it("says Most savings once, with what the number means", () => {
    render(
      <MostSavingsNote atOptimal shortfall={0} onBack={vi.fn()} caption="in today's dollars" />
    );
    expect(screen.getAllByText("Most savings")).toHaveLength(1);
    expect(screen.getByText("in today's dollars")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says how much less another amount saves, and goes back", () => {
    const back = vi.fn();
    render(<MostSavingsNote atOptimal={false} shortfall={4210} onBack={back} caption="unused" />);
    expect(screen.getByText("$4,210 less than the most savings")).toBeInTheDocument();
    expect(screen.queryByText("unused")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to most savings" }));
    expect(back).toHaveBeenCalled();
  });

  it("never says $0 less away from the most savings", () => {
    render(<MostSavingsNote atOptimal={false} shortfall={0} />);
    expect(screen.getByText("$1 less than the most savings")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
