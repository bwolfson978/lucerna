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
    expect(screen.getByText("Conversion amount")).toBeInTheDocument();
  });

  it("uses 'Highest savings' instead of 'Optimal'", () => {
    render(<ConversionSlider {...defaultProps} />);
    expect(screen.queryByText(/Optimal/)).not.toBeInTheDocument();
    expect(screen.getByText(/Highest savings/)).toBeInTheDocument();
  });
});
