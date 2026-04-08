import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversionSlider } from "../ConversionSlider";

describe("ConversionSlider", () => {
  const defaultProps = {
    value: 100000,
    min: 0,
    max: 210000,
    optimalValue: 120000,
    onChange: vi.fn(),
  };

  it("displays the label", () => {
    render(<ConversionSlider {...defaultProps} />);
    expect(screen.getByText("Roth conversion amount")).toBeInTheDocument();
  });

  it("shows lantern legend instead of 'Optimal'", () => {
    render(<ConversionSlider {...defaultProps} />);
    expect(screen.queryByText(/Optimal/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Roth conversion amount with highest estimated lifetime savings")
    ).toBeInTheDocument();
  });
});
