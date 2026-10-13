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

/** The results page's bracket chart, with its legend and added-tax row, from tool data. */
export function BracketFillChart({
  data,
  framed = true,
}: {
  data: BracketFillData;
  /** Draw its own card with a title. Off when embedded in another card. */
  framed?: boolean;
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
        fixedHeight
      />
    </div>
  );
}
