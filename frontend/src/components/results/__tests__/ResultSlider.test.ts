import {
  resultAtTotal,
  stableChartMax,
  type BracketFillData,
  type ResultCardData,
} from "@lucerna/ui";

// resultAtTotal is the one place a result's numbers at a slider total are worked out,
// for the result card and the full results page.

const data: ResultCardData = {
  result_id: "r1",
  estimated_lifetime_tax_savings_todays_dollars: 20000,
  total_conversion: 100000,
  total_tax_on_conversions: 30000,
  years_with_conversions: 2,
  schedule_by_year: [],
};
const year = (y: number, conversion: number, tax: number) => ({
  year: y,
  age: 60 + y - 2026,
  income: 40000,
  rmd: 0,
  conversion,
  tax,
});
const fill: BracketFillData = {
  years: [year(2026, 60000, 18000), year(2027, 40000, 12000), year(2028, 0, 0)],
  brackets: [
    { rate: 0.1, min: 0, max: 50000 },
    { rate: 0.2, min: 50000, max: null },
  ],
  standard_deduction: 10000,
};
const point = (total: number, savings: number, conversions: number[], taxes?: number[]) => ({
  total,
  savings,
  tax: (taxes ?? []).reduce((s, t) => s + t, 0),
  conversions,
  rmds: [0, 0, 5000],
  ...(taxes && { taxes }),
});
const curve = {
  points: [
    point(0, 0, [0, 0, 0], [0, 0, 0]),
    point(50000, 12000, [30000, 20000, 0], [6000, 4000, 0]),
    point(100000, 20000, [60000, 40000, 0], [18000, 12000, 0]),
    point(200000, 8000, [100000, 60000, 40000], [40000, 20000, 12000]),
  ],
};

describe("resultAtTotal", () => {
  it("shows the engine's own figures at the optimal total", () => {
    expect(resultAtTotal(data, fill, curve, 100000)).toEqual({
      atOptimal: true,
      savings: 20000,
      shortfall: 0,
      taxCost: 30000,
      years: 2,
      chart: fill,
    });
  });

  it("blends the curve's totals and each year's tax off the optimum", () => {
    const at = resultAtTotal(data, fill, curve, 25000);
    expect(at).toMatchObject({ atOptimal: false, savings: 6000, shortfall: 14000, taxCost: 5000 });
    expect(at.years).toBe(2);
    expect(at.chart!.years.map((y) => y.conversion)).toEqual([15000, 10000, 0]);
    expect(at.chart!.years.map((y) => y.tax)).toEqual([3000, 2000, 0]);
    // The years add up to the total.
    expect(at.chart!.years.reduce((s, y) => s + y.tax, 0)).toBe(at.taxCost);
  });

  it("drops a sliver of a year only one neighbouring point converts in", () => {
    // Just past 100,000 the third year would get 0.001 x 40,000 = $40.
    const at = resultAtTotal(data, fill, curve, 100100);
    expect(at.years).toBe(2);
    expect(at.chart!.years[2]).toMatchObject({ conversion: 0, tax: 0 });
  });

  it("figures federal tax from the brackets for a curve without yearly taxes", () => {
    const old = { points: curve.points.map(({ taxes: _taxes, ...p }) => p) };
    const at = resultAtTotal(data, fill, old, 50000);
    // 40,000 income + 30,000 conversion - 10,000 deduction: 10,000 of it at 20%, 20,000 at 10%.
    expect(at.chart!.years[0].tax).toBe(4000);
  });

  it("stays at the optimal figures without a curve", () => {
    expect(resultAtTotal(data, fill, undefined, 50000).atOptimal).toBe(true);
  });
});

it("stableChartMax covers every point's tallest year", () => {
  expect(stableChartMax(fill, curve)).toBe(140000);
});

describe("the rest of the bar", () => {
  // Someone on Social Security and withdrawals: converting more makes more of the benefit
  // taxable and shrinks the senior deduction, so those move with the slider too.
  const retired: BracketFillData = {
    ...fill,
    years: fill.years.map((y) => ({
      ...y,
      income: 0,
      withdrawal: 20000,
      taxable_social_security: 25000,
      extra_deduction: 7000,
    })),
  };
  const moving = {
    points: curve.points.map((p, i) => ({
      ...p,
      withdrawals: [20000, 20000, 20000 - i * 1000],
      taxable_social_security: [5000 + i * 10000, 5000, 5000],
      extra_deductions: [8000 - i * 500, 8000, 8000],
    })),
  };

  it("blends with the curve off the optimum", () => {
    // Halfway between the points at 0 and 50,000.
    const [first, , third] = resultAtTotal(data, retired, moving, 25000).chart!.years;
    expect(first).toMatchObject({
      withdrawal: 20000,
      taxable_social_security: 10000,
      extra_deduction: 7750,
    });
    expect(third.withdrawal).toBe(19500);
  });

  it("keeps the optimal schedule's for a curve without them", () => {
    const [first] = resultAtTotal(data, retired, curve, 25000).chart!.years;
    expect(first).toMatchObject({
      withdrawal: 20000,
      taxable_social_security: 25000,
      extra_deduction: 7000,
    });
  });

  it("stays out of results that never had it", () => {
    const [first] = resultAtTotal(data, fill, curve, 25000).chart!.years;
    expect(first).not.toHaveProperty("withdrawal");
    expect(first).not.toHaveProperty("taxable_social_security");
    expect(first).not.toHaveProperty("extra_deduction");
  });

  it("counts toward the fixed scale", () => {
    // Tallest: the last point's first year, 0 + 0 + 20,000 + 35,000 + 100,000 - 6,500.
    expect(stableChartMax(retired, moving)).toBe(148500);
  });
});
