import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { BracketChart, barTop, bracketLegend } from "@lucerna/ui";
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

  describe("what a bar stacks", () => {
    // A retiree: a pension, a required withdrawal, a withdrawal for spending, the taxed
    // part of Social Security and a conversion, with $8,000 of 65+ deductions.
    const retiree = {
      year: 2030,
      age: 75,
      income: 12000,
      rmdAmount: 9000,
      withdrawal: 15000,
      socialSecurity: 20000,
      conversion: 30000,
      extraDeduction: 8000,
    };
    const segments = (container: HTMLElement) =>
      Array.from(container.querySelectorAll("rect[data-segment]")).map((r) => ({
        key: r.getAttribute("data-segment"),
        y: parseFloat(r.getAttribute("y") ?? "0"),
        height: parseFloat(r.getAttribute("height") ?? "0"),
      }));

    it("ends where the brackets apply: everything stacked, less the 65+ deductions", () => {
      expect(barTop(retiree)).toBe(78000);
      expect(barTop({ year: 2030, conversion: 5000, extraDeduction: 8000 })).toBe(0);
    });

    it("puts Social Security right under the conversion", () => {
      const { container } = render(<BracketChart years={[retiree]} {...single} />);
      const drawn = segments(container);
      expect(drawn.map((s) => s.key)).toEqual([
        "income",
        "rmdAmount",
        "withdrawal",
        "socialSecurity",
        "conversion",
      ]);
      // Each part starts where the one below it ends.
      drawn.slice(1).forEach((s, i) => expect(s.y + s.height).toBeCloseTo(drawn[i].y));
    });

    it("takes the 65+ deductions off the bottom of the bar", () => {
      const { container: plain } = render(
        <BracketChart years={[{ ...retiree, extraDeduction: 0 }]} {...single} />
      );
      const { container: trimmed } = render(<BracketChart years={[retiree]} {...single} />);
      const [income, rmd] = segments(trimmed);
      const [fullIncome, fullRmd] = segments(plain);
      // 8,000 of the 12,000 at the bottom is not drawn; the parts above keep their size.
      expect(income.height).toBeCloseTo(fullIncome.height / 3, 0);
      expect(rmd.height).toBeCloseTo(fullRmd.height);
      // A deduction larger than the bottom part eats into the next one.
      const { container: deep } = render(
        <BracketChart years={[{ ...retiree, extraDeduction: 15000 }]} {...single} />
      );
      expect(segments(deep).map((s) => s.key)).toEqual([
        "rmdAmount",
        "withdrawal",
        "socialSecurity",
        "conversion",
      ]);
    });

    it("lists in the legend only the parts some year has", () => {
      const labels = (years: Parameters<typeof bracketLegend>[0]) =>
        bracketLegend(years).map((item) => item.label);
      expect(labels([{ year: 2030, income: 50000 }])).toEqual([
        "Other income",
        "Roth conversion",
        "Room left in bracket",
      ]);
      expect(labels([{ year: 2030, withdrawal: 35000, conversion: 30000 }, retiree])).toEqual([
        "Other income",
        "Required withdrawal",
        "Withdrawals for spending",
        "Taxable Social Security",
        "Roth conversion",
        "Room left in bracket",
      ]);
      const { getByText, queryByText } = render(
        <BracketChart years={[{ year: 2030, withdrawal: 35000, conversion: 30000 }]} {...single} />
      );
      expect(getByText("Withdrawals for spending")).toBeInTheDocument();
      expect(queryByText("Other income")).not.toBeInTheDocument();
    });
  });
});
