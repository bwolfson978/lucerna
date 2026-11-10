import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConversionSlider, savingsGlow } from "@lucerna/ui";

describe("ConversionSlider", () => {
  const props = { value: 100000, min: 0, max: 210000, optimalValue: 120000 };
  const savings = [
    { total: 0, savings: 0 },
    { total: 60000, savings: 9000 },
    { total: 120000, savings: 20000 },
    { total: 210000, savings: 4000 },
  ];

  it("reads the total out to screen readers", () => {
    render(<ConversionSlider {...props} onChange={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Total amount to convert" })).toHaveAttribute(
      "aria-valuetext",
      "$100,000"
    );
  });

  it("says so at the most savings, and carries no label of its own", () => {
    render(<ConversionSlider {...props} value={120000} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "$120,000, most savings");
    expect(screen.queryByText("Most savings")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
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

  it("shades the track by savings when it has the curve", () => {
    const { container, rerender } = render(
      <ConversionSlider {...props} savings={savings} onChange={vi.fn()} />
    );
    // jsdom drops a gradient it cannot parse, so the track says whether it has one.
    expect(container.querySelector("[data-ui=slider-track]")).toHaveAttribute("data-glow");
    rerender(<ConversionSlider {...props} onChange={vi.fn()} />);
    expect(container.querySelector("[data-ui=slider-track]")).not.toHaveAttribute("data-glow");
  });
});

describe("savingsGlow", () => {
  const points = [
    { total: 0, savings: 0 },
    { total: 50000, savings: 10000 },
    { total: 100000, savings: 2000 },
  ];

  it("is darkest at the marked total and paper where nothing is saved", () => {
    const glow = savingsGlow(points, 0, 100000, 50000) ?? "";
    // Pine (#1b4332) at the middle of the track, paper-deep (#e9e5dc) at the start.
    expect(glow).toContain("rgb(27, 67, 50) calc(14px + (100% - 28px) * 0.5)");
    expect(glow).toContain("rgb(233, 229, 220) calc(14px + (100% - 28px) * 0)");
  });

  it("marks the given total even when the curve has no point there", () => {
    const glow = savingsGlow(points, 0, 100000, 40000) ?? "";
    expect(glow).toContain("rgb(27, 67, 50) calc(14px + (100% - 28px) * 0.4)");
  });

  it("keeps a long curve to a short gradient", () => {
    const long = Array.from({ length: 400 }, (_, i) => ({
      total: i * 250,
      savings: 200 - Math.abs(200 - i),
    }));
    const glow = savingsGlow(long, 0, 99750, 50000) ?? "";
    expect(glow.split("rgb(").length - 1).toBeLessThanOrEqual(52);
  });

  it("is nothing without a curve, or when no total saves anything", () => {
    expect(savingsGlow(undefined, 0, 100000, 50000)).toBeNull();
    expect(savingsGlow([points[0]], 0, 100000, 50000)).toBeNull();
    expect(
      savingsGlow(
        points.map((p) => ({ ...p, savings: -p.savings })),
        0,
        100000,
        50000
      )
    ).toBeNull();
  });
});
