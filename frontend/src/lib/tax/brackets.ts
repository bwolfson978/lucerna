/**
 * Client-side federal tax bracket calculations.
 * Mirrors backend/app/engine/tax.py exactly for real-time slider interactivity.
 */

import type { FilingStatus, BracketFillResult } from "@/lib/types";

interface Bracket {
  min: number;
  max: number;
  rate: number;
}

// 2025 Federal Tax Brackets — Source: IRS Revenue Procedure 2024-40
// Must stay in sync with backend/app/engine/tax.py
const BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: [
    { min: 0, max: 11925, rate: 0.10 },
    { min: 11925, max: 48475, rate: 0.12 },
    { min: 48475, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 626350, rate: 0.35 },
    { min: 626350, max: Infinity, rate: 0.37 },
  ],
  married_filing_jointly: [
    { min: 0, max: 23850, rate: 0.10 },
    { min: 23850, max: 96950, rate: 0.12 },
    { min: 96950, max: 206700, rate: 0.22 },
    { min: 206700, max: 394600, rate: 0.24 },
    { min: 394600, max: 501050, rate: 0.32 },
    { min: 501050, max: 751600, rate: 0.35 },
    { min: 751600, max: Infinity, rate: 0.37 },
  ],
};

const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: 15000,
  married_filing_jointly: 30000,
};

export function calculateFederalTax(
  grossIncome: number,
  filingStatus: FilingStatus = "single"
): number {
  const deduction = STANDARD_DEDUCTION[filingStatus];
  const taxableIncome = Math.max(0, grossIncome - deduction);
  const brackets = BRACKETS[filingStatus];

  let tax = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxableInBracket =
      Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += taxableInBracket * bracket.rate;
  }

  return tax;
}

export function analyzeBracketFill(
  baseIncome: number,
  conversionAmount: number,
  filingStatus: FilingStatus = "single"
): BracketFillResult[] {
  const deduction = STANDARD_DEDUCTION[filingStatus];
  const baseTaxable = Math.max(0, baseIncome - deduction);
  const totalTaxable = Math.max(0, baseIncome + conversionAmount - deduction);
  const brackets = BRACKETS[filingStatus];

  const results: BracketFillResult[] = [];
  for (const bracket of brackets) {
    const capacity =
      bracket.max === Infinity ? 500000 : bracket.max - bracket.min;

    const filledByIncome = Math.max(
      0,
      Math.min(baseTaxable, bracket.max) - bracket.min
    );
    const totalFilled = Math.max(
      0,
      Math.min(totalTaxable, bracket.max) - bracket.min
    );
    const filledByConversion = totalFilled - filledByIncome;
    const remaining = Math.max(0, capacity - totalFilled);
    const taxInBracket = totalFilled * bracket.rate;

    const displayMax =
      bracket.max === Infinity ? bracket.min + 500000 : bracket.max;

    results.push({
      bracket_rate: bracket.rate,
      bracket_min: bracket.min,
      bracket_max: displayMax,
      bracket_capacity: capacity,
      filled_by_income: filledByIncome,
      filled_by_conversion: filledByConversion,
      remaining_capacity: remaining,
      tax_in_bracket: taxInBracket,
    });

    if (totalTaxable <= bracket.max) break;
  }

  return results;
}
