"use client";

import { useMemo, useState } from "react";
import { isBracketFillData, type BracketFillData } from "./BracketFillChart";
import { federalTax, isConversionCurveData, sampleCurve, type ConversionCurveData } from "./curve";
import type { ResultCardData, ResultCardSelection, ResultDetails } from "./ResultCard";

/** Every number a result shows at one total on the slider. */
export interface ResultAtTotal {
  atOptimal: boolean;
  /** Estimated lifetime tax savings in today's dollars. */
  savings: number;
  /** How much less that is than at the optimal total. */
  shortfall: number;
  /** Tax on the conversions (federal and state). */
  taxCost: number;
  /** Years with a conversion. */
  years: number;
  /** The bracket chart's years at this total. Absent without chart data. */
  chart?: BracketFillData;
}

/**
 * A result at any total converted: the engine's own figures at the optimal total, and
 * off it the curve's (sampleCurve). The one place this is worked out, for the result
 * card (web chat, Claude, ChatGPT) and the full results page alike.
 */
export function resultAtTotal(
  data: ResultCardData,
  fill: BracketFillData | undefined,
  curve: ConversionCurveData | undefined,
  total: number
): ResultAtTotal {
  const optimal = data.total_conversion;
  const bestSavings = data.estimated_lifetime_tax_savings_todays_dollars;
  const sample = curve && total !== optimal ? sampleCurve(curve, total) : null;
  if (!sample) {
    return {
      atOptimal: true,
      savings: bestSavings,
      shortfall: 0,
      taxCost: data.total_tax_on_conversions,
      years: data.years_with_conversions,
      chart: fill,
    };
  }
  const savings = Math.round(sample.savings);
  return {
    atOptimal: false,
    savings,
    shortfall: Math.max(0, bestSavings - savings),
    taxCost: sample.tax,
    years: sample.conversions.filter((c) => Math.round(c) > 0).length,
    chart: fill && {
      ...fill,
      years: fill.years.map((y, i) => {
        const conversion = sample.conversions[i] ?? 0;
        const rmd = sample.rmds[i] ?? y.rmd;
        const base = y.income + rmd;
        // The engine's tax for the year (federal and state); older results without it
        // get the federal tax from the brackets.
        const tax =
          sample.taxes?.[i] ??
          federalTax(base + conversion, fill.brackets, fill.standard_deduction) -
            federalTax(base, fill.brackets, fill.standard_deduction);
        return {
          ...y,
          rmd: Math.round(rmd),
          conversion: Math.round(conversion),
          tax: Math.round(tax),
        };
      }),
    },
  };
}

/** One vertical scale for every total, so bars move and the chart's axis stays put. */
export function stableChartMax(fill: BracketFillData, curve: ConversionCurveData): number {
  let most = 0;
  fill.years.forEach((y, i) => {
    most = Math.max(most, y.income + y.rmd + y.conversion);
    for (const p of curve.points) most = Math.max(most, y.income + p.rmds[i] + p.conversions[i]);
  });
  return most;
}

/**
 * The slider's state and everything shown at its total. Used by the result card and the
 * full results page, so both show the same numbers. Without a usable curve there is no
 * slider (`curve` is undefined) and the result stays at the optimal total.
 */
export function useResultSlider(
  data: ResultCardData,
  details: ResultDetails | undefined,
  onSelectionChange?: (selection: ResultCardSelection) => void
) {
  const fill = isBracketFillData(details?.bracket_fill) ? details.bracket_fill : undefined;
  const curve =
    fill &&
    isConversionCurveData(details?.curve) &&
    details.curve.points[0].conversions.length === fill.years.length
      ? details.curve
      : undefined;
  const optimal = data.total_conversion;
  const [total, setTotal] = useState(optimal);
  const at = useMemo(() => resultAtTotal(data, fill, curve, total), [data, fill, curve, total]);
  const stableMax = useMemo(
    () => (fill && curve ? stableChartMax(fill, curve) : undefined),
    [fill, curve]
  );
  const max = curve ? Math.max(curve.points[curve.points.length - 1].total, optimal) : 0;

  const move = (next: number) => {
    setTotal(next);
    if (!curve || !onSelectionChange) return;
    onSelectionChange({
      total: next,
      savings: resultAtTotal(data, fill, curve, next).savings,
      optimalTotal: optimal,
      optimalSavings: data.estimated_lifetime_tax_savings_todays_dollars,
    });
  };

  return { ...at, total, move, optimal, max, curve, stableMax };
}
