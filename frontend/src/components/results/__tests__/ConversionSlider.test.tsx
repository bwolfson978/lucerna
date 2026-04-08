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

  it("displays formatted value as clickable reset button", () => {
    render(<ConversionSlider {...defaultProps} />);
    expect(screen.getByText("$100,000")).toBeInTheDocument();
  });

  it("shows diamond legend for highest savings", () => {
    render(<ConversionSlider {...defaultProps} />);
    expect(screen.getByText("Highest savings")).toBeInTheDocument();
  });
});
