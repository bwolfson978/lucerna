"use client";

import { useMemo, useState } from "react";
import { BracketFillChart, isBracketFillData, type BracketFillData } from "./BracketFillChart";
import { ConversionSlider } from "./ConversionSlider";
import { ConversionStrip, type ConversionYear } from "./ConversionStrip";
import { federalTax, isConversionCurveData, sampleCurve, type ConversionCurveData } from "./curve";
import { formatCompactCurrency, formatCurrency, formatSavings } from "./format";
import { Stat } from "./Stat";

/**
 * What the result card shows. This is the `structuredContent` that
 * `analyze_roth_conversions` returns (backend/app/tools/core.py summarize_result);
 * the parity fixture shared/fixtures/view-data.json keeps the two aligned.
 */
export interface ResultCardData {
  result_id: string;
  estimated_lifetime_tax_savings_todays_dollars: number;
  total_conversion: number;
  total_tax_on_conversions: number;
  years_with_conversions: number;
  schedule_by_year: ConversionYear[];
}

export function isResultCardData(value: unknown): value is ResultCardData {
  const v = value as ResultCardData | undefined;
  return (
    !!v &&
    typeof v.result_id === "string" &&
    typeof v.estimated_lifetime_tax_savings_todays_dollars === "number" &&
    typeof v.total_conversion === "number" &&
    typeof v.total_tax_on_conversions === "number" &&
    typeof v.years_with_conversions === "number" &&
    Array.isArray(v.schedule_by_year)
  );
}

/** Chart series for the card: the analyze tool's View `_meta`
 * (backend app/tools/views.py result_view). */
export interface ResultDetails {
  bracket_fill?: BracketFillData;
  /** Schedules for other totals, for the slider. Absent from older results. */
  curve?: ConversionCurveData;
}

export function isResultDetails(value: unknown): value is ResultDetails {
  const v = value as ResultDetails | undefined;
  return !!v && typeof v === "object" && isBracketFillData(v.bracket_fill);
}

/** Where the slider sits, reported as it moves (e.g. to tell the assistant). */
export interface ResultCardSelection {
  total: number;
  savings: number;
  optimalTotal: number;
  optimalSavings: number;
}

interface ResultCardProps {
  data: ResultCardData;
  /** Chart series. With them the card shows how conversions fill the tax brackets;
   * without, a simple bar per year. With a curve as well, a slider tries other totals. */
  details?: ResultDetails;
  /** Open the complete analysis. Omit to hide the button. */
  onOpenFullResults?: () => void;
  /** Ask the assistant about the total on the slider. Omit to hide the button. */
  onAsk?: (message: string) => void;
  /** Called when the slider moves. */
  onSelectionChange?: (selection: ResultCardSelection) => void;
}

/**
 * Headline result of an analysis. Rendered natively by the web app and, unchanged,
 * inside the `ui://roth-conversions/result-card.html` MCP App View.
 */
export function ResultCard({
  data,
  details,
  onOpenFullResults,
  onAsk,
  onSelectionChange,
}: ResultCardProps) {
  const fill = isBracketFillData(details?.bracket_fill) ? details.bracket_fill : undefined;
  const curve =
    fill &&
    isConversionCurveData(details?.curve) &&
    details.curve.points[0].conversions.length === fill.years.length
      ? details.curve
      : undefined;
  const optimal = data.total_conversion;
  const bestSavings = data.estimated_lifetime_tax_savings_todays_dollars;
  const [total, setTotal] = useState(optimal);
  const atOptimal = !curve || total === optimal;
  const sample = curve && !atOptimal ? sampleCurve(curve, total) : null;

  const savings = sample ? Math.round(sample.savings) : bestSavings;
  const shortfall = Math.max(0, bestSavings - savings);
  const taxCost = sample ? sample.tax : data.total_tax_on_conversions;
  const years = sample
    ? sample.conversions.filter((c) => Math.round(c) > 0).length
    : data.years_with_conversions;

  // Off the optimum, each year's bars and added tax come from the curve, with the tax
  // figured on the brackets the way the results page does.
  const chart: BracketFillData | undefined =
    fill && sample
      ? {
          ...fill,
          years: fill.years.map((y, i) => {
            const conversion = sample.conversions[i] ?? 0;
            const rmd = sample.rmds[i] ?? y.rmd;
            const base = y.income + rmd;
            const tax =
              federalTax(base + conversion, fill.brackets, fill.standard_deduction) -
              federalTax(base, fill.brackets, fill.standard_deduction);
            return {
              ...y,
              rmd: Math.round(rmd),
              conversion: Math.round(conversion),
              tax: Math.round(tax),
            };
          }),
        }
      : fill;

  // One vertical scale for every total, so bars move and the axis stays put.
  const stableMax = useMemo(() => {
    if (!fill || !curve) return undefined;
    let most = 0;
    fill.years.forEach((y, i) => {
      most = Math.max(most, y.income + y.rmd + y.conversion);
      for (const p of curve.points) most = Math.max(most, y.income + p.rmds[i] + p.conversions[i]);
    });
    return most;
  }, [fill, curve]);

  const max = curve ? Math.max(curve.points[curve.points.length - 1].total, optimal) : 0;

  const move = (next: number) => {
    setTotal(next);
    if (!curve || !onSelectionChange) return;
    onSelectionChange({
      total: next,
      savings: next === optimal ? bestSavings : Math.round(sampleCurve(curve, next).savings),
      optimalTotal: optimal,
      optimalSavings: bestSavings,
    });
  };

  return (
    <article className="card-recommended gap-comfortable flex flex-col" data-ui="result-card">
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow" data-ui="eyebrow">
          Estimated lifetime tax savings
        </span>
        <span className="metric-value-hero text-pine" data-ui="hero">
          {formatSavings(savings)}
        </span>
        {atOptimal ? (
          <span className="text-caption text-text-tertiary">
            In today&apos;s dollars, compared with not converting
          </span>
        ) : (
          <span className="text-caption text-negative" data-ui="shortfall">
            {formatCurrency(shortfall)} less than the most savings
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Converted" value={formatCompactCurrency(atOptimal ? optimal : total)} />
        <Stat label="Tax cost" value={formatCompactCurrency(taxCost)} />
        <Stat label="Years" value={String(years)} />
      </div>
      {curve && (
        <ConversionSlider
          value={total}
          max={max}
          optimalValue={optimal}
          onChange={move}
          maxLabel={`${formatCompactCurrency(max)}, your whole balance`}
        />
      )}
      {chart ? (
        <BracketFillChart data={chart} framed={false} stableMaxGrossAmount={stableMax} />
      ) : (
        <ConversionStrip schedule={data.schedule_by_year} />
      )}
      {(onOpenFullResults || (onAsk && !atOptimal)) && (
        <div className="border-border pt-default flex flex-col gap-3 border-t sm:flex-row sm:flex-wrap sm:items-center">
          {onOpenFullResults && (
            <button type="button" className="btn-dark" onClick={onOpenFullResults} data-ui="cta">
              See full results
            </button>
          )}
          {onAsk && !atOptimal ? (
            <button
              type="button"
              className="btn-ghost"
              data-ui="ask"
              onClick={() =>
                onAsk(
                  `Why does converting ${formatCompactCurrency(total)} save ${formatCurrency(shortfall)} less than converting ${formatCompactCurrency(optimal)}?`
                )
              }
            >
              Ask about {formatCompactCurrency(total)}
            </button>
          ) : (
            <span className="text-caption text-text-tertiary text-center sm:text-left">
              {curve
                ? "Year by year detail, save and compare"
                : "Try other amounts and compare schedules"}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
