/**
 * Timeline generation and merging utilities.
 * Extracted from InputForm for independent testability and reuse.
 */

import type { YearlyIncome } from "@/lib/types";
import { CURRENT_YEAR } from "@/lib/utils/constants";

/**
 * Generate an income timeline from base inputs.
 * For already-retired users (retAge <= currentAge), plans until RMDs (age 73).
 */
export function generateTimeline(
  currentAge: number,
  retAge: number,
  baseIncome: number,
  annualGrowthRate: number
): YearlyIncome[] {
  const yearsToRetirement = retAge - currentAge;
  const trajectoryLength =
    yearsToRetirement > 0 ? yearsToRetirement : Math.max(1, Math.min(10, 73 - currentAge));
  return Array.from({ length: trajectoryLength }, (_, i) => ({
    year: CURRENT_YEAR + i,
    gross_income: Math.round(baseIncome * Math.pow(1 + annualGrowthRate / 100, i)),
  }));
}

/**
 * Smart-merge: regenerate timeline from base inputs but preserve
 * years where the user customized values (notes or state override).
 */
export function mergeTimeline(fresh: YearlyIncome[], existing: YearlyIncome[]): YearlyIncome[] {
  const pinned = new Map<number, YearlyIncome>();
  for (const row of existing) {
    if ((row.notes && row.notes.length > 0) || row.state != null) {
      pinned.set(row.year, row);
    }
  }
  return fresh.map((row) => pinned.get(row.year) ?? row);
}
