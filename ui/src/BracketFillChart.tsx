"use client";

import { BracketChart, type TaxBracket } from "./BracketChart";

/**
 * The tax bracket chart's data at the optimal schedule (backend app/tools/views.py
 * bracket_fill_view; the web app builds the same in lib/results/viewData.ts).
 */
export interface BracketFillData {
  years: {
    year: number;
    age: number;
    /** Gross income other than the conversion and any required withdrawal. */
    income: number;
    /** Required minimum distribution that year. */
    rmd: number;
    conversion: number;
    /** Federal tax the conversion adds that year. */
    tax: number;
  }[];
  /** Federal brackets in taxable income, lowest first; `max` is null for the top one. */
  brackets: TaxBracket[];
  standard_deduction: number;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Whether a payload is chart data in this shape. Checks every field the chart reads, so
 * data from an older or newer server (or a conversation saved before a change) is
 * rejected and the card falls back instead of the chart throwing.
 */
export function isBracketFillData(value: unknown): value is BracketFillData {
  const v = value as BracketFillData | undefined;
  return (
    !!v &&
    typeof v === "object" &&
    isNumber(v.standard_deduction) &&
    Array.isArray(v.brackets) &&
    v.brackets.length > 0 &&
    v.brackets.every(
      (b) => !!b && isNumber(b.rate) && isNumber(b.min) && (b.max === null || isNumber(b.max))
    ) &&
    Array.isArray(v.years) &&
    v.years.every(
      (y) =>
        !!y &&
        isNumber(y.year) &&
        isNumber(y.income) &&
        isNumber(y.rmd) &&
        isNumber(y.conversion) &&
        isNumber(y.tax)
    )
  );
}

/** The results page's bracket chart, with its legend and added-tax row, from tool data. */
export function BracketFillChart({
  data,
  framed = true,
  stableMaxGrossAmount,
}: {
  data: BracketFillData;
  /** Draw its own card with a title. Off when embedded in another card. */
  framed?: boolean;
  /** Fix the vertical scale (see BracketChart), e.g. while a slider changes the data. */
  stableMaxGrossAmount?: number;
}) {
  return (
    <div
      className={framed ? "card flex flex-col gap-3" : "flex flex-col gap-3"}
      data-ui="bracket-fill"
    >
      {framed && (
        <h3 className="text-h3 text-text-primary">How conversions fill your tax brackets</h3>
      )}
      <BracketChart
        years={data.years.map((y) => ({
          year: y.year,
          age: y.age,
          income: y.income,
          rmdAmount: y.rmd,
          conversion: y.conversion,
        }))}
        brackets={data.brackets}
        standardDeduction={data.standard_deduction}
        addedTax={data.years.map((y) => y.tax)}
        stableMaxGrossAmount={stableMaxGrossAmount}
        fixedHeight
      />
    </div>
  );
}
