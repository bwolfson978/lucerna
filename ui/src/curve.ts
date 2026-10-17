import type { TaxBracket } from "./BracketChart";

/**
 * The conversion curve as the result card's slider gets it (backend app/tools/views.py
 * curve_view; the web app builds the same in lib/results/viewData.ts): real schedules
 * for a range of total amounts, lowest total first.
 */
export interface ConversionCurveData {
  points: {
    /** Total converted across all years. */
    total: number;
    /** Estimated lifetime tax savings in today's dollars, as the headline. */
    savings: number;
    /** Tax on the conversions. */
    tax: number;
    /** Each year's conversion, one per plan year. */
    conversions: number[];
    /** Each year's required withdrawal, which shrinks as more is converted. */
    rmds: number[];
  }[];
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumbers = (v: unknown): v is number[] => Array.isArray(v) && v.every(isNumber);

/** Whether a payload is a curve in this shape, with at least two points of equal length. */
export function isConversionCurveData(value: unknown): value is ConversionCurveData {
  const v = value as ConversionCurveData | undefined;
  if (!v || typeof v !== "object" || !Array.isArray(v.points) || v.points.length < 2) {
    return false;
  }
  const years = v.points[0]?.conversions?.length;
  return v.points.every(
    (p) =>
      !!p &&
      isNumber(p.total) &&
      isNumber(p.savings) &&
      isNumber(p.tax) &&
      isNumbers(p.conversions) &&
      isNumbers(p.rmds) &&
      p.conversions.length === years &&
      p.rmds.length === years
  );
}

export interface CurveSample {
  savings: number;
  tax: number;
  conversions: number[];
  rmds: number[];
}

/**
 * The curve at any total: a blend of the two points around it, with each year's
 * conversion scaled so they add up to the total exactly. Matches the results page's
 * slider (frontend hooks/useConversionSlider.ts).
 */
export function sampleCurve(curve: ConversionCurveData, total: number): CurveSample {
  const points = curve.points;
  let i = 0;
  while (i < points.length - 2 && points[i + 1].total < total) i++;
  const a = points[i];
  const b = points[i + 1];
  const span = b.total - a.total;
  const t = span > 0 ? Math.min(1, Math.max(0, (total - a.total) / span)) : 0;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  let conversions = a.conversions.map((c, j) => lerp(c, b.conversions[j]));
  const sum = conversions.reduce((s, c) => s + c, 0);
  if (sum > 0 && total > 0) conversions = conversions.map((c) => (c * total) / sum);
  return {
    savings: lerp(a.savings, b.savings),
    tax: lerp(a.tax, b.tax),
    conversions,
    rmds: a.rmds.map((r, j) => lerp(r, b.rmds[j])),
  };
}

/** Federal income tax on a gross income: brackets in taxable income, after the deduction. */
export function federalTax(gross: number, brackets: TaxBracket[], standardDeduction: number) {
  const taxable = Math.max(0, gross - standardDeduction);
  return brackets.reduce((tax, b) => {
    const top = b.max ?? Infinity;
    return taxable > b.min ? tax + (Math.min(taxable, top) - b.min) * b.rate : tax;
  }, 0);
}
