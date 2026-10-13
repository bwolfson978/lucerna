/**
 * Scenario draft: the inputs shared by the conversation and the form.
 *
 * The draft mirrors the calculator form field for field. The assistant fills it
 * through the backend's update_scenario tool; the form edits it directly. Both
 * turn a complete draft into a ScenarioInput with the same rules.
 *
 * Reference implementation: backend/app/tools/draft.py. The parity cases in
 * shared/fixtures/scenario-draft-cases.json keep the two in lockstep.
 */

import type { FilingStatus, HealthcareInput, PlanYear, ScenarioInput } from "@/lib/types";
import { generateTimeline, mergeTimeline } from "@/lib/utils/timeline";

export interface ScenarioDraft {
  age: number | null;
  filing_status: FilingStatus | null;
  /** State code, "custom", or null for federal only. */
  state: string | null;
  /** State in retirement. Null means the same as `state`. */
  retirement_state: string | null;
  custom_state_rate_pct: number | null;
  current_income: number | null;
  income_growth_rate_pct: number | null;
  traditional_balance: number | null;
  roth_balance: number | null;
  /** Age withdrawals from retirement accounts begin. */
  retirement_age: number | null;
  /** Total yearly household spending in retirement. */
  retirement_spending: number | null;
  /** Social Security and pensions once withdrawals begin. */
  retirement_income: number | null;
  planning_horizon_age: number | null;
  investment_return_pct: number | null;
  discount_rate_pct: number | null;
  include_aca: boolean;
  household_size: number | null;
  monthly_slcsp_premium: number | null;
  employer_coverage_year: number | null;
  timeline: PlanYear[];
}

export type DraftPatch = Partial<ScenarioDraft>;

export const EMPTY_DRAFT: ScenarioDraft = {
  age: null,
  filing_status: null,
  state: null,
  retirement_state: null,
  custom_state_rate_pct: null,
  current_income: null,
  income_growth_rate_pct: 3,
  traditional_balance: null,
  roth_balance: null,
  retirement_age: null,
  retirement_spending: null,
  retirement_income: null,
  planning_horizon_age: 90,
  investment_return_pct: 7,
  discount_rate_pct: 5,
  include_aca: false,
  household_size: 1,
  monthly_slcsp_premium: 620,
  employer_coverage_year: null,
  timeline: [],
};

export const REQUIRED_FIELDS = [
  "age",
  "filing_status",
  "current_income",
  "traditional_balance",
  "retirement_age",
] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

const TIMELINE_BASE_FIELDS = [
  "age",
  "retirement_age",
  "current_income",
  "income_growth_rate_pct",
] as const;

/** Fill in any fields missing from a draft that came from storage or the network. */
export function normalizeDraft(value: Partial<ScenarioDraft> | null | undefined): ScenarioDraft {
  return { ...EMPTY_DRAFT, ...(value ?? {}), timeline: value?.timeline ?? [] };
}

/** Regenerate the timeline when the inputs it depends on changed (pinned rows survive). */
export function syncTimeline(
  draft: ScenarioDraft,
  previous: ScenarioDraft | null,
  startYear: number
): ScenarioDraft {
  if (previous && TIMELINE_BASE_FIELDS.every((f) => draft[f] === previous[f])) return draft;
  if (
    draft.age == null ||
    draft.retirement_age == null ||
    draft.current_income == null ||
    draft.current_income <= 0
  ) {
    return { ...draft, timeline: [] };
  }
  const fresh = generateTimeline(
    draft.age,
    draft.retirement_age,
    draft.current_income,
    draft.income_growth_rate_pct ?? 0,
    startYear
  );
  return {
    ...draft,
    timeline: draft.timeline.length === 0 ? fresh : mergeTimeline(fresh, draft.timeline),
  };
}

/** Apply a form edit. Choosing a state also sets the retirement state, as the form always has. */
export function applyDraftPatch(
  draft: ScenarioDraft,
  patch: DraftPatch,
  startYear: number
): ScenarioDraft {
  const next: ScenarioDraft = { ...draft, ...patch };
  if ("state" in patch && !("retirement_state" in patch)) {
    next.retirement_state = patch.state ?? null;
  }
  if ("timeline" in patch) return next;
  return syncTimeline(next, draft, startYear);
}

export function missingFields(draft: ScenarioDraft): RequiredField[] {
  return REQUIRED_FIELDS.filter((name) => {
    const value = draft[name];
    if (value == null) return true;
    if ((name === "current_income" || name === "traditional_balance") && (value as number) <= 0)
      return true;
    return false;
  });
}

export function isDraftReady(draft: ScenarioDraft): boolean {
  return (
    missingFields(draft).length === 0 &&
    draft.timeline.length > 0 &&
    draft.timeline.every((y) => y.gross_income >= 0)
  );
}

/** True when the user has entered anything beyond the defaults. */
export function hasDraftValues(draft: ScenarioDraft): boolean {
  return (
    REQUIRED_FIELDS.some((f) => draft[f] != null) ||
    draft.roth_balance != null ||
    draft.state != null ||
    draft.retirement_spending != null ||
    draft.retirement_income != null ||
    draft.timeline.length > 0
  );
}

/** Engine input for a complete draft (port of the form's submit handler). */
export function buildScenarioInput(draft: ScenarioDraft): ScenarioInput {
  const missing = missingFields(draft);
  if (missing.length > 0) throw new Error(`Scenario is not ready: missing ${missing.join(", ")}`);
  const healthcare: HealthcareInput | null = draft.include_aca
    ? {
        household_size: draft.household_size ?? 1,
        monthly_slcsp_premium: draft.monthly_slcsp_premium || 620,
        has_employer_coverage_after: draft.employer_coverage_year,
      }
    : null;
  return {
    age: draft.age!,
    filing_status: draft.filing_status!,
    timeline: draft.timeline,
    traditional_ira_balance: draft.traditional_balance!,
    roth_ira_balance: draft.roth_balance ?? 0,
    drawdown_start_age: draft.retirement_age!,
    planning_horizon_age: draft.planning_horizon_age ?? 90,
    default_drawdown: draft.retirement_spending || null,
    retirement_income: draft.retirement_income || 0,
    annual_growth_rate: (draft.investment_return_pct ?? 7) / 100,
    discount_rate: (draft.discount_rate_pct ?? 5) / 100,
    healthcare,
    state: draft.state,
    retirement_state:
      draft.retirement_state != null && draft.retirement_state !== draft.state
        ? draft.retirement_state
        : null,
    custom_state_rate:
      draft.state === "custom" && draft.custom_state_rate_pct
        ? draft.custom_state_rate_pct / 100
        : null,
  };
}
