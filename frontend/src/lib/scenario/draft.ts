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
import {
  DEFAULT_PLANNING_HORIZON_AGE,
  generateTimeline,
  mergeTimeline,
  sourceLabel,
  type IncomeSource,
} from "@/lib/utils/timeline";

export type { IncomeSource } from "@/lib/utils/timeline";

export interface ScenarioDraft {
  age: number | null;
  filing_status: FilingStatus | null;
  /** State code, "custom", or null for federal only. */
  state: string | null;
  /** State in retirement. Null means the same as `state`. */
  retirement_state: string | null;
  custom_state_rate_pct: number | null;
  current_income: number | null;
  /** Last age current income is earned. Null: the year before retirement, or for life. */
  current_income_end_age: number | null;
  income_growth_rate_pct: number | null;
  traditional_balance: number | null;
  roth_balance: number | null;
  /** Age withdrawals from retirement accounts begin. */
  retirement_age: number | null;
  /** Total household spending once drawdowns start; accounts cover what income doesn't. */
  retirement_spending: number | null;
  planning_horizon_age: number | null;
  investment_return_pct: number | null;
  discount_rate_pct: number | null;
  /** Yearly inflation, percent. Every amount is in today's dollars. */
  inflation_pct: number | null;
  include_aca: boolean;
  household_size: number | null;
  monthly_slcsp_premium: number | null;
  employer_coverage_year: number | null;
  income_sources: IncomeSource[];
  timeline: PlanYear[];
}

export type DraftPatch = Partial<ScenarioDraft>;

export const DEFAULT_INFLATION_PCT = 2.5;

export const EMPTY_DRAFT: ScenarioDraft = {
  age: null,
  filing_status: null,
  state: null,
  retirement_state: null,
  custom_state_rate_pct: null,
  current_income: null,
  current_income_end_age: null,
  income_growth_rate_pct: 3,
  traditional_balance: null,
  roth_balance: null,
  retirement_age: null,
  retirement_spending: null,
  planning_horizon_age: 90,
  investment_return_pct: 7,
  discount_rate_pct: 5,
  inflation_pct: DEFAULT_INFLATION_PCT,
  include_aca: false,
  household_size: 1,
  monthly_slcsp_premium: 620,
  employer_coverage_year: null,
  income_sources: [],
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
  "current_income_end_age",
  "planning_horizon_age",
  "income_sources",
  "inflation_pct",
] as const;

/**
 * Fill in any fields missing from a draft that came from storage or the network. A draft
 * saved before inflation was modeled gets the default inflation and a fresh timeline, since
 * its incomes were projected without it (rows with a note or a state override are kept).
 */
export function normalizeDraft(value: Partial<ScenarioDraft> | null | undefined): ScenarioDraft {
  const draft: ScenarioDraft = {
    ...EMPTY_DRAFT,
    ...(value ?? {}),
    income_sources: value?.income_sources ?? [],
    timeline: value?.timeline ?? [],
  };
  if (value && !("inflation_pct" in value) && draft.timeline.length > 0) {
    return syncTimeline(draft, null, draft.timeline[0].year);
  }
  return draft;
}

/** Regenerate the timeline when the inputs it depends on changed (pinned rows survive). */
export function syncTimeline(
  draft: ScenarioDraft,
  previous: ScenarioDraft | null,
  startYear: number
): ScenarioDraft {
  if (
    previous &&
    TIMELINE_BASE_FIELDS.every(
      (f) => JSON.stringify(draft[f] ?? null) === JSON.stringify(previous[f] ?? null)
    )
  )
    return draft;
  if (
    draft.age == null ||
    draft.retirement_age == null ||
    draft.current_income == null ||
    draft.current_income <= 0
  ) {
    return { ...draft, timeline: [] };
  }
  const fresh = projectedTimeline(draft, startYear);
  return {
    ...draft,
    timeline: draft.timeline.length === 0 ? fresh : mergeTimeline(fresh, draft.timeline),
  };
}

/** The timeline a complete draft projects before any per-year edits. */
export function projectedTimeline(draft: ScenarioDraft, startYear: number): PlanYear[] {
  return generateTimeline(
    draft.age!,
    draft.retirement_age!,
    draft.current_income!,
    draft.income_growth_rate_pct ?? 0,
    startYear,
    {
      planningHorizonAge: draft.planning_horizon_age ?? DEFAULT_PLANNING_HORIZON_AGE,
      sources: draft.income_sources,
      baseEndAge: draft.current_income_end_age,
      inflationPct: draft.inflation_pct ?? DEFAULT_INFLATION_PCT,
    }
  );
}

/** Problems with income sources that block a run. */
export function incomeSourceErrors(draft: ScenarioDraft): string[] {
  return draft.income_sources
    .filter((src) => src.end_age != null && src.end_age < src.start_age)
    .map((src) => `${sourceLabel(src)} ends before it starts`);
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
    draft.timeline.every((y) => y.gross_income >= 0) &&
    incomeSourceErrors(draft).length === 0
  );
}

/** True when the user has entered anything beyond the defaults. */
export function hasDraftValues(draft: ScenarioDraft): boolean {
  return (
    REQUIRED_FIELDS.some((f) => draft[f] != null) ||
    draft.roth_balance != null ||
    draft.state != null ||
    draft.retirement_spending != null ||
    draft.income_sources.length > 0 ||
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
    annual_growth_rate: (draft.investment_return_pct ?? 7) / 100,
    discount_rate: (draft.discount_rate_pct ?? 5) / 100,
    inflation_rate: (draft.inflation_pct ?? DEFAULT_INFLATION_PCT) / 100,
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
