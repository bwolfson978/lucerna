import { EMPTY_DRAFT, type ScenarioDraft } from "../draft";
import { changedFields, detailChanges, draftKey } from "../changes";
import { scenarioStatus } from "@/components/conversation/ScenarioPanel";

const READY: ScenarioDraft = {
  ...EMPTY_DRAFT,
  age: 52,
  filing_status: "married_filing_jointly",
  current_income: 90000,
  traditional_balance: 600000,
  retirement_age: 60,
  timeline: [{ year: 2026, gross_income: 90000 }],
};

describe("changedFields", () => {
  it("lists the shown fields that differ", () => {
    expect(changedFields(EMPTY_DRAFT, { ...EMPTY_DRAFT, age: 52, state: "CA" })).toEqual([
      "age",
      "state",
    ]);
    // The timeline isn't a value in the panel.
    expect(changedFields(READY, { ...READY, timeline: [] })).toEqual([]);
  });
});

describe("detailChanges", () => {
  it("counts a state and its retirement state as one detail", () => {
    const after = { ...EMPTY_DRAFT, state: "CA", retirement_state: "NV", age: 52 };
    expect(detailChanges(EMPTY_DRAFT, after)).toEqual({ count: 2, allNew: true });
  });

  it("counts a value replacing a default as added", () => {
    expect(detailChanges(EMPTY_DRAFT, { ...EMPTY_DRAFT, planning_horizon_age: 93 }).allNew).toBe(
      true
    );
  });

  it("says when a value was replaced rather than added", () => {
    expect(detailChanges(READY, { ...READY, retirement_age: 58 })).toEqual({
      count: 1,
      allNew: false,
    });
  });
});

describe("draftKey", () => {
  it("ignores key order and empty values", () => {
    const reordered = Object.fromEntries(Object.entries(READY).reverse()) as ScenarioDraft;
    const { state: _state, ...withoutState } = READY;
    expect(draftKey(reordered)).toBe(draftKey(READY));
    expect(draftKey(withoutState as ScenarioDraft)).toBe(draftKey(READY));
    expect(draftKey({ ...READY, age: 53 })).not.toBe(draftKey(READY));
  });
});

describe("scenarioStatus", () => {
  it("names what's still needed, then whether the last run is current", () => {
    expect(scenarioStatus(EMPTY_DRAFT, null).text).toBe("Add your details");
    expect(scenarioStatus({ ...READY, retirement_age: null }, null).text).toBe(
      "Still needed: age you start drawing"
    );
    expect(scenarioStatus(READY, null)).toEqual({ tone: "ready", text: "Ready to run" });
    expect(scenarioStatus(READY, draftKey(READY))).toEqual({ tone: "done", text: "Up to date" });
    expect(scenarioStatus({ ...READY, age: 53 }, draftKey(READY)).tone).toBe("stale");
  });
});
