import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConversionSlider } from "@lucerna/ui";

describe("ConversionSlider", () => {
  const props = { value: 100000, min: 0, max: 210000, optimalValue: 120000 };

  it("reads out the total and marks the most savings on the track", () => {
    render(<ConversionSlider {...props} onChange={vi.fn()} />);
    expect(screen.getByText("$100,000")).toBeInTheDocument();
    expect(screen.getByText("Most savings")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Total amount to convert" })).toHaveAttribute(
      "aria-valuetext",
      "$100,000"
    );
  });

  it("goes back to the most savings from anywhere else", () => {
    const onChange = vi.fn();
    render(<ConversionSlider {...props} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to most savings" }));
    expect(onChange).toHaveBeenCalledWith(120000);
  });

  it("shows a badge instead of the button at the most savings", () => {
    render(<ConversionSlider {...props} value={120000} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Back to most savings" })).toBeNull();
    expect(screen.getAllByText("Most savings")).toHaveLength(2);
  });

  it("snaps to the most savings when dragged close to it", () => {
    const onChange = vi.fn();
    render(<ConversionSlider {...props} onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "119000" } });
    expect(onChange).toHaveBeenLastCalledWith(120000);
    fireEvent.change(slider, { target: { value: "60000" } });
    expect(onChange).toHaveBeenLastCalledWith(60000);
  });
});
