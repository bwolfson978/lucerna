import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { BracketChart } from "@lucerna/ui";
import { CHART_COLORS } from "@/lib/utils/constants";
import { getFallbackTaxConfig } from "@/lib/tax/TaxConfigProvider";

const tax = getFallbackTaxConfig();
const single = {
  brackets: tax.brackets.single,
  standardDeduction: tax.standard_deduction.single,
};

// Stub SVG getBBox for jsdom
beforeAll(() => {
  // @ts-expect-error jsdom doesn't support SVG getBBox
  SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
});

describe("BracketChart", () => {
  it("draws the bracket lines with rates and the convert and tax rows", () => {
    const { getByText, getAllByText } = render(
      <BracketChart
        years={[
          { year: 2026, income: 60000, conversion: 20000 },
          { year: 2027, income: 60000, conversion: 0 },
        ]}
        addedTax={[2400, 0]}
        {...single}
      />
    );
    expect(getAllByText(/^12%/).length).toBeGreaterThan(0);
    expect(getAllByText(/^0%/).length).toBeGreaterThan(0);
    expect(getByText("Convert")).toBeInTheDocument();
    expect(getByText("Tax")).toBeInTheDocument();
    // Each year's conversion, then the tax it adds. Narrow columns round further and drop
    // the dollar sign (2K); wide ones keep both ($2.4K).
    expect(getByText(/^\$?20K$/)).toBeInTheDocument();
    expect(getByText(/^\$?2(\.4)?K$/)).toBeInTheDocument();
  });

  describe("minimum segment visibility", () => {
    it("renders a visible rect for a very small conversion amount", () => {
      // A tiny $50 conversion on top of substantial income — would normally be <1px
      const years = [
        {
          year: 2026,
          age: 50,
          income: 20000,
          conversion: 50,
        },
      ];

      const { container } = render(<BracketChart years={years} {...single} />);

      // Find all rects with the conversion gold color
      const rects = container.querySelectorAll("rect");
      const conversionRects = Array.from(rects).filter(
        (r) => r.getAttribute("fill") === CHART_COLORS.conversion
      );

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
          income: 100, // tiny gross income
          conversion: 0,
        },
      ];

      const { container } = render(<BracketChart years={years} {...single} />);

      const rects = container.querySelectorAll("rect");
      const incomeRects = Array.from(rects).filter(
        (r) => r.getAttribute("fill") === CHART_COLORS.income
      );

      expect(incomeRects.length).toBeGreaterThan(0);
      const height = parseFloat(incomeRects[0].getAttribute("height") || "0");
      expect(height).toBeGreaterThanOrEqual(3);
    });

    it("does not render a rect when amount is zero", () => {
      const years = [
        {
          year: 2026,
          age: 50,
        },
      ];

      const { container } = render(<BracketChart years={years} {...single} />);

      const rects = container.querySelectorAll("rect");
      // No income or conversion colored rects should appear
      const incomeRects = Array.from(rects).filter(
        (r) => r.getAttribute("fill") === CHART_COLORS.income
      );
      const conversionRects = Array.from(rects).filter(
        (r) => r.getAttribute("fill") === CHART_COLORS.conversion
      );

      expect(incomeRects.length).toBe(0);
      expect(conversionRects.length).toBe(0);
    });
  });
});
