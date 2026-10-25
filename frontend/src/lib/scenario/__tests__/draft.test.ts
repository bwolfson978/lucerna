import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_DRAFT,
  applyDraftPatch,
  buildScenarioInput,
  hasDraftValues,
  incomeSourceErrors,
  isDraftReady,
  missingFields,
  normalizeDraft,
  syncTimeline,
  type ScenarioDraft,
} from "../draft";

interface Fixture {
  build: { name: string; start_year: number; draft: Partial<ScenarioDraft>; scenario: unknown }[];
  missing: { name: string; draft: Partial<ScenarioDraft>; missing: string[] }[];
}

const fixture: Fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "../shared/fixtures/scenario-draft-cases.json"), "utf8")
);

/** Drop nulls and empty notes so TS output compares with Python's exclude_none dump. */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k, v]) => v != null && !(k === "notes" && v === ""))
        .map(([k, v]) => [k, clean(v)])
    );
  }
  return value;
}

describe("scenario draft parity with the backend", () => {
  it.each(fixture.build.map((c) => [c.name, c] as const))("builds %s", (_name, c) => {
    const draft = syncTimeline(normalizeDraft(c.draft), null, c.start_year);
    expect(clean(buildScenarioInput(draft))).toEqual(clean(c.scenario));
  });

  it.each(fixture.missing.map((c) => [c.name, c] as const))("missing fields: %s", (_name, c) => {
    expect(missingFields(normalizeDraft(c.draft))).toEqual(c.missing);
  });
});

describe("normalizeDraft", () => {
  it("re-projects a timeline saved before inflation was modeled", () => {
    const saved = syncTimeline(
      normalizeDraft({
        birth_year: 1981,
        birth_month: 6,
        filing_status: "single",
        current_income: 100000,
        traditional_balance: 200000,
        retirement_age: 48,
        income_growth_rate_pct: 0,
        inflation_pct: 0,
        planning_horizon_age: 50,
      }),
      null,
      2026
    );
    const { inflation_pct: _dropped, ...legacy } = saved;
    const loaded = normalizeDraft(legacy);
    expect(loaded.inflation_pct).toBe(2.5);
    expect(loaded.timeline.map((y) => y.gross_income)).toEqual([100000, 97561, 95181, 0, 0, 0]);
    // A draft that has inflation keeps its timeline as saved
    expect(normalizeDraft(saved).timeline).toEqual(saved.timeline);
  });
});

describe("applyDraftPatch", () => {
  const base = applyDraftPatch(
    EMPTY_DRAFT,
    {
      birth_year: 1981,
      birth_month: 6,
      filing_status: "single",
      current_income: 100000,
      traditional_balance: 200000,
      retirement_age: 48,
      income_growth_rate_pct: 0,
      inflation_pct: 0,
      planning_horizon_age: 50,
    },
    2026
  );

  it("generates the timeline once base inputs are present", () => {
    expect(base.timeline.map((y) => y.year)).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
    expect(base.timeline.map((y) => y.gross_income)).toEqual([100000, 100000, 100000, 0, 0, 0]);
    expect(isDraftReady(base)).toBe(true);
  });

  it("adds income sources to the years they cover", () => {
    const withSs = applyDraftPatch(
      base,
      { income_sources: [{ kind: "social_security", owner: "you", amount: 30000, start_age: 49 }] },
      2026
    );
    expect(withSs.timeline.map((y) => y.gross_income)).toEqual([
      100000, 100000, 100000, 0, 30000, 30000,
    ]);
  });

  it("blocks a run when a source ends before it starts", () => {
    const bad = applyDraftPatch(
      base,
      {
        income_sources: [{ kind: "pension", owner: "you", amount: 1, start_age: 49, end_age: 48 }],
      },
      2026
    );
    expect(incomeSourceErrors(bad)).toEqual(["Pension ends before it starts"]);
    expect(isDraftReady(bad)).toBe(false);
  });

  it("keeps edited rows unless base inputs change", () => {
    const edited = applyDraftPatch(
      base,
      {
        timeline: base.timeline.map((y) => (y.year === 2027 ? { ...y, gross_income: 5 } : y)),
      },
      2026
    );
    const unrelated = applyDraftPatch(edited, { roth_balance: 10 }, 2026);
    expect(unrelated.timeline[1].gross_income).toBe(5);
    const rebased = applyDraftPatch(unrelated, { current_income: 90000 }, 2026);
    expect(rebased.timeline[1].gross_income).toBe(90000);
  });

  it("regenerates the timeline when inflation changes", () => {
    const inflated = applyDraftPatch(base, { inflation_pct: 2.5 }, 2026);
    // No raises: pay falls by inflation in today's dollars
    expect(inflated.timeline.map((y) => y.gross_income)).toEqual([100000, 97561, 95181, 0, 0, 0]);
  });

  it("choosing a state also sets the retirement state", () => {
    const next = applyDraftPatch(base, { state: "CA" }, 2026);
    expect(next.retirement_state).toBe("CA");
    const moved = applyDraftPatch(next, { retirement_state: "TX" }, 2026);
    expect(buildScenarioInput(moved).retirement_state).toBe("TX");
  });

  it("knows when a draft has user values", () => {
    expect(hasDraftValues(EMPTY_DRAFT)).toBe(false);
    expect(hasDraftValues(base)).toBe(true);
  });

  it("refuses to build an incomplete draft", () => {
    expect(() => buildScenarioInput(EMPTY_DRAFT)).toThrow(/missing birth_year/);
  });
});
