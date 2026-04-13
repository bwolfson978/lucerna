import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { BracketChart } from "../BracketChart";

// Mock useContainerWidth to return a fixed desktop width
vi.mock("@/hooks/useContainerWidth", () => ({
  useContainerWidth: () => 800,
}));

// Mock useScrollFade
vi.mock("@/hooks/useScrollFade", () => ({
  useScrollFade: () => ({ hasScrolled: false }),
}));

// Stub SVG getBBox for jsdom
beforeAll(() => {
  // @ts-expect-error jsdom doesn't support SVG getBBox
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
});

function makeBracketFill(overrides: {
  bracket_rate: number;
  bracket_min: number;
  bracket_max: number;
  filled_by_income?: number;
  filled_by_conversion?: number;
}) {
  return {
    bracket_rate: overrides.bracket_rate,
    bracket_min: overrides.bracket_min,
    bracket_max: overrides.bracket_max,
    bracket_capacity: overrides.bracket_max - overrides.bracket_min,
    filled_by_income: overrides.filled_by_income ?? 0,
    filled_by_conversion: overrides.filled_by_conversion ?? 0,
    remaining_capacity:
      overrides.bracket_max -
      overrides.bracket_min -
      (overrides.filled_by_income ?? 0) -
      (overrides.filled_by_conversion ?? 0),
    tax_in_bracket: 0,
  };
}

describe("BracketChart", () => {
  describe("minimum segment visibility", () => {
    it("renders a visible rect for a very small conversion amount", () => {
      // A tiny $50 conversion in a large bracket — would normally be <1px
      const years = [
        {
          year: 2026,
          age: 50,
          bracketFill: [
            makeBracketFill({
              bracket_rate: 0.1,
              bracket_min: 0,
              bracket_max: 11925,
              filled_by_income: 11925,
              filled_by_conversion: 0,
            }),
            makeBracketFill({
              bracket_rate: 0.12,
              bracket_min: 11925,
              bracket_max: 48475,
              filled_by_income: 0,
              filled_by_conversion: 50,
            }),
            makeBracketFill({
              bracket_rate: 0.22,
              bracket_min: 48475,
              bracket_max: 103350,
            }),
          ],
        },
      ];

      const { container } = render(<BracketChart years={years} filingStatus="single" />);

      // Find all rects with the conversion gold color
      const rects = container.querySelectorAll("rect");
      const conversionRects = Array.from(rects).filter((r) => r.getAttribute("fill") === "#F0C674");

      // The small conversion should still produce a visible rect
      expect(conversionRects.length).toBeGreaterThan(0);

      // Its height should be at least 3px (the minimum)
      const height = parseFloat(conversionRects[0].getAttribute("height") || "0");
      expect(height).toBeGreaterThanOrEqual(3);
    });

    it("renders a visible rect for a very small income amount", () => {
      const years = [
        {
          year: 2026,
          age: 50,
          bracketFill: [
            makeBracketFill({
              bracket_rate: 0.1,
              bracket_min: 0,
              bracket_max: 11925,
              filled_by_income: 100, // tiny income
              filled_by_conversion: 0,
            }),
            makeBracketFill({
              bracket_rate: 0.12,
              bracket_min: 11925,
              bracket_max: 48475,
            }),
            makeBracketFill({
              bracket_rate: 0.22,
              bracket_min: 48475,
              bracket_max: 103350,
            }),
          ],
        },
      ];

      const { container } = render(<BracketChart years={years} filingStatus="single" />);

      const rects = container.querySelectorAll("rect");
      const incomeRects = Array.from(rects).filter((r) => r.getAttribute("fill") === "#6C5CE7");

      expect(incomeRects.length).toBeGreaterThan(0);
      const height = parseFloat(incomeRects[0].getAttribute("height") || "0");
      expect(height).toBeGreaterThanOrEqual(3);
    });

    it("does not render a rect when amount is zero", () => {
      const years = [
        {
          year: 2026,
          age: 50,
          bracketFill: [
            makeBracketFill({
              bracket_rate: 0.1,
              bracket_min: 0,
              bracket_max: 11925,
              filled_by_income: 0,
              filled_by_conversion: 0,
            }),
            makeBracketFill({
              bracket_rate: 0.12,
              bracket_min: 11925,
              bracket_max: 48475,
            }),
            makeBracketFill({
              bracket_rate: 0.22,
              bracket_min: 48475,
              bracket_max: 103350,
            }),
          ],
        },
      ];

      const { container } = render(<BracketChart years={years} filingStatus="single" />);

      const rects = container.querySelectorAll("rect");
      // No income or conversion colored rects should appear
      const incomeRects = Array.from(rects).filter((r) => r.getAttribute("fill") === "#6C5CE7");
      const conversionRects = Array.from(rects).filter((r) => r.getAttribute("fill") === "#F0C674");

      expect(incomeRects.length).toBe(0);
      expect(conversionRects.length).toBe(0);
    });
  });
});
