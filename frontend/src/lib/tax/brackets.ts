/**
 * Client-side federal tax bracket calculations.
 * Mirrors backend/app/engine/tax.py for real-time slider interactivity.
 *
 * Bracket data is loaded from federal-brackets-2025.json, which is
 * auto-generated from backend/data/tax_brackets_2025.json by
 * scripts/generate_frontend_tax_data.py. Do not edit the JSON manually.
 */

import type { FilingStatus, BracketFillResult } from "@/lib/types";
import taxData from "./federal-brackets-2025.json";

interface Bracket {
  min: number;
  max: number;
  rate: number;
}

// Parse JSON brackets, converting null max to Infinity
function parseBrackets(raw: typeof taxData.brackets.single): Bracket[] {
  return raw.map((b) => ({
    min: b.min,
    max: b.max === null ? Infinity : b.max,
    rate: b.rate,
  }));
}

export const BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: parseBrackets(taxData.brackets.single),
  married_filing_jointly: parseBrackets(taxData.brackets.married_filing_jointly),
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: taxData.standard_deduction.single,
  married_filing_jointly: taxData.standard_deduction.married_filing_jointly,
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
