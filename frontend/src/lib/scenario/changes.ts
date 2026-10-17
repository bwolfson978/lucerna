/**
 * What changed between two versions of the scenario draft: for marking the values the
 * assistant just filled in, and for the one-line note the conversation shows when it
 * updates the scenario.
 */

import type { ScenarioValues } from "@lucerna/ui";
import { EMPTY_DRAFT, type ScenarioDraft } from "./draft";

/** Draft fields the scenario panel shows, in the order it shows them. */
const SHOWN_FIELDS = [
  "age",
  "filing_status",
  "current_income",
  "current_income_end_age",
  "income_growth_rate_pct",
  "income_sources",
  "traditional_balance",
  "roth_balance",
  "retirement_age",
  "retirement_spending",
  "state",
  "retirement_state",
  "custom_state_rate_pct",
  "include_aca",
  "household_size",
  "monthly_slcsp_premium",
  "planning_horizon_age",
  "investment_return_pct",
  "inflation_pct",
] as const satisfies readonly (keyof ScenarioDraft & keyof ScenarioValues)[];

type ShownField = (typeof SHOWN_FIELDS)[number];

/** Fields that read as one detail to the person: state now and later, the ACA settings. */
const DETAIL_OF: Partial<Record<ShownField, ShownField>> = {
  current_income_end_age: "current_income",
  retirement_state: "state",
  custom_state_rate_pct: "state",
  household_size: "include_aca",
  monthly_slcsp_premium: "include_aca",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Fields whose values differ between two drafts. */
export function changedFields(before: ScenarioDraft, after: ScenarioDraft): ShownField[] {
  return SHOWN_FIELDS.filter((f) => !same(before[f], after[f]));
}

/** How many details changed, and whether every one of them was empty (or a default) before. */
export function detailChanges(
  before: ScenarioDraft,
  after: ScenarioDraft
): { count: number; allNew: boolean } {
  const changed = changedFields(before, after);
  const details = new Set(changed.map((f) => DETAIL_OF[f] ?? f));
  const allNew = changed.every((f) => {
    const was = before[f];
    return (
      was == null ||
      same(was, EMPTY_DRAFT[f]) ||
      (Array.isArray(was) && was.length === 0) ||
      was === false
    );
  });
  return { count: details.size, allNew };
}

/**
 * A stable key for a draft, to tell whether it has changed since it was last run. Keys
 * are sorted and empty values dropped, so a draft from the assistant and the same draft
 * edited here match.
 */
export function draftKey(draft: ScenarioDraft): string {
  return JSON.stringify(draft, (_, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v != null)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : value
  );
}
