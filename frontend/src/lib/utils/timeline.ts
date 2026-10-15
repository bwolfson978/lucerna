/**
 * Timeline generation and merging utilities.
 * Extracted from InputForm for independent testability and reuse.
 */

import type { PlanYear } from "@/lib/types";
import { incomeSourceLabel, type IncomeKind, type IncomeSource } from "@lucerna/ui";
import { CURRENT_YEAR } from "@/lib/utils/constants";

export type { IncomeKind, IncomeSource };

export const DEFAULT_PLANNING_HORIZON_AGE = 90;

/** Display name, e.g. "Social Security (spouse)". */
export const sourceLabel = incomeSourceLabel;

export interface TimelineOptions {
  planningHorizonAge?: number;
  sources?: IncomeSource[];
  /** Last age current income is earned. Default: the year before retirement, or for life. */
  baseEndAge?: number | null;
  /** Yearly inflation, percent. Amounts are in today's dollars. */
  inflationPct?: number;
}

/**
 * Project income from today through the plan's last year, in today's dollars.
 * Current income runs until `baseEndAge` and gets raises of `annualGrowthRate`, so it grows
 * by the raise less inflation. Each income source adds its amount for the ages it covers:
 * Social Security and other income keep up with inflation, and a pension stays at its
 * stated amount, so it shrinks by inflation. Port of backend/app/tools/draft.py
 * `generate_timeline`.
 */
export function generateTimeline(
  currentAge: number,
  drawdownStartAge: number,
  baseIncome: number,
  annualGrowthRate: number,
  startYear: number = CURRENT_YEAR,
  options: TimelineOptions = {}
): PlanYear[] {
  const horizon = options.planningHorizonAge ?? DEFAULT_PLANNING_HORIZON_AGE;
  const sources = options.sources ?? [];
  const baseEnd =
    options.baseEndAge ?? (drawdownStartAge > currentAge ? drawdownStartAge - 1 : horizon);
  const inflation = options.inflationPct ?? 0;
  const realGrowth = (1 + annualGrowthRate / 100) / (1 + inflation / 100);
  const length = Math.max(1, horizon - currentAge + 1);
  return Array.from({ length }, (_, i) => {
    const age = currentAge + i;
    let income = age <= baseEnd ? baseIncome * Math.pow(realGrowth, i) : 0;
    let socialSecurity = 0;
    for (const src of sources) {
      const end = src.end_age ?? horizon;
      if (src.start_age <= age && age <= end) {
        income +=
          src.kind === "pension" ? src.amount / Math.pow(1 + inflation / 100, i) : src.amount;
        if (src.kind === "social_security") socialSecurity += src.amount;
      }
    }
    const row: PlanYear = { year: startYear + i, gross_income: Math.round(income) };
    // Recorded on its own so only the taxable part of benefits is taxed
    if (socialSecurity > 0) row.social_security = Math.round(socialSecurity);
    return row;
  });
}

/**
 * Smart-merge: regenerate timeline from base inputs but preserve
 * years where the user customized values (notes or state override).
 */
export function mergeTimeline(fresh: PlanYear[], existing: PlanYear[]): PlanYear[] {
  const pinned = new Map<number, PlanYear>();
  for (const row of existing) {
    if ((row.notes && row.notes.length > 0) || row.state != null) {
      pinned.set(row.year, row);
    }
  }
  return fresh.map((row) => pinned.get(row.year) ?? row);
}
