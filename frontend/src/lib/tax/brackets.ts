/**
 * Client-side federal tax bracket calculations.
 * Mirrors backend/app/engine/tax.py for real-time slider interactivity.
 *
 * At runtime, bracket data comes from the backend via TaxConfigProvider.
 * The bundled federal-brackets-2025.json (auto-generated from
 * backend/data/tax_brackets_2025.json) serves as the fallback when
 * the backend is unreachable.
 */

import type { FilingStatus, BracketFillResult } from "@/lib/types";
import type { TaxConfig } from "./TaxConfigProvider";
import { getFallbackTaxConfig } from "./TaxConfigProvider";

interface Bracket {
  min: number;
  max: number;
  rate: number;
}

// Parse JSON brackets, converting null max to Infinity
function parseBrackets(
  raw: { min: number; max: number | null; rate: number }[]
): Bracket[] {
  return raw.map((b) => ({
    min: b.min,
    max: b.max === null ? Infinity : b.max,
    rate: b.rate,
  }));
}

function getBrackets(
  filingStatus: FilingStatus,
  config?: TaxConfig
): Bracket[] {
  const c = config ?? getFallbackTaxConfig();
  return parseBrackets(c.brackets[filingStatus]);
}

function getDeduction(
  filingStatus: FilingStatus,
  config?: TaxConfig
): number {
  const c = config ?? getFallbackTaxConfig();
  return c.standard_deduction[filingStatus];
}

// Legacy exports for backward compatibility (use fallback data)
const fallback = getFallbackTaxConfig();

export const BRACKETS: Record<FilingStatus, Bracket[]> = {
  single: parseBrackets(fallback.brackets.single),
  married_filing_jointly: parseBrackets(fallback.brackets.married_filing_jointly),
};

export const STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  single: fallback.standard_deduction.single,
  married_filing_jointly: fallback.standard_deduction.married_filing_jointly,
};

export function calculateFederalTax(
  grossIncome: number,
  filingStatus: FilingStatus = "single",
  config?: TaxConfig
): number {
  const deduction = getDeduction(filingStatus, config);
  const taxableIncome = Math.max(0, grossIncome - deduction);
  const brackets = getBrackets(filingStatus, config);

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
  filingStatus: FilingStatus = "single",
  config?: TaxConfig
): BracketFillResult[] {
  const deduction = getDeduction(filingStatus, config);
  const baseTaxable = Math.max(0, baseIncome - deduction);
  const totalTaxable = Math.max(0, baseIncome + conversionAmount - deduction);
  const brackets = getBrackets(filingStatus, config);

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
