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
}

/**
 * Project income from today through the plan's last year.
 * Current income (growing yearly) runs until `baseEndAge`; each income source adds its
 * amount for the ages it covers. Port of backend/app/tools/draft.py `generate_timeline`.
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
  const length = Math.max(1, horizon - currentAge + 1);
  return Array.from({ length }, (_, i) => {
    const age = currentAge + i;
    let income = age <= baseEnd ? baseIncome * Math.pow(1 + annualGrowthRate / 100, i) : 0;
    let socialSecurity = 0;
    for (const src of sources) {
      const end = src.end_age ?? horizon;
      if (src.start_age <= age && age <= end) {
        income += src.amount;
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
