import { describe, it, expect } from "vitest";
import { generateTimeline, mergeTimeline } from "../timeline";

describe("generateTimeline", () => {
  it("runs through the plan end with income until retirement", () => {
    const timeline = generateTimeline(35, 65, 100_000, 3);
    expect(timeline).toHaveLength(56);
    expect(timeline[29].gross_income).toBeGreaterThan(0);
    expect(timeline[30].gross_income).toBe(0);
  });

  it("first year income matches base income", () => {
    const timeline = generateTimeline(35, 65, 100_000, 0);
    expect(timeline[0].gross_income).toBe(100_000);
  });

  it("applies growth rate correctly", () => {
    const timeline = generateTimeline(35, 65, 100_000, 10);
    // Year 1 (index 1): 100_000 * 1.10 = 110_000
    expect(timeline[1].gross_income).toBe(110_000);
  });

  it("works in today's dollars: raises less inflation, pensions shrink, the rest keeps up", () => {
    const timeline = generateTimeline(60, 62, 100_000, 3, 2026, {
      planningHorizonAge: 63,
      inflationPct: 2.5,
      sources: [
        { kind: "social_security", owner: "you", amount: 30_000, start_age: 62 },
        { kind: "pension", owner: "you", amount: 20_000, start_age: 62 },
      ],
    });
    // 100,000 x (1.03 / 1.025)
    expect(timeline[1].gross_income).toBe(100_488);
    // Social Security 30,000 plus a pension of 20,000 / 1.025^2 and 20,000 / 1.025^3
    expect(timeline[2].gross_income).toBe(49_036);
    expect(timeline[3].gross_income).toBe(48_572);
    expect(timeline[3].social_security).toBe(30_000);
  });

  it("handles zero growth rate", () => {
    const timeline = generateTimeline(40, 45, 80_000, 0, 2026, { planningHorizonAge: 44 });
    expect(timeline).toHaveLength(5);
    for (const year of timeline) {
      expect(year.gross_income).toBe(80_000);
    }
  });

  it("handles already-retired (retAge <= currentAge)", () => {
    const timeline = generateTimeline(67, 65, 50_000, 0);
    // Through the default plan end at 90, with income for life
    expect(timeline).toHaveLength(24);
    expect(timeline.every((y) => y.gross_income === 50_000)).toBe(true);
  });

  it("adds sources over their age range and stops current income at baseEndAge", () => {
    const timeline = generateTimeline(63, 73, 20_000, 0, 2026, {
      planningHorizonAge: 70,
      baseEndAge: 64,
      sources: [
        { kind: "social_security", owner: "you", amount: 40_000, start_age: 67 },
        { kind: "pension", owner: "spouse", amount: 10_000, start_age: 65, end_age: 66 },
      ],
    });
    expect(timeline.map((y) => y.gross_income)).toEqual([
      20_000, 20_000, 10_000, 10_000, 40_000, 40_000, 40_000, 40_000,
    ]);
  });

  it("assigns sequential years starting from current year", () => {
    const timeline = generateTimeline(35, 38, 100_000, 0);
    const currentYear = new Date().getFullYear();
    expect(timeline[0].year).toBe(currentYear);
    expect(timeline[1].year).toBe(currentYear + 1);
    expect(timeline[2].year).toBe(currentYear + 2);
  });
});

describe("mergeTimeline", () => {
  it("returns fresh timeline when no years are pinned", () => {
    const fresh = [
      { year: 2026, gross_income: 100_000 },
      { year: 2027, gross_income: 110_000 },
    ];
    const existing = [
      { year: 2026, gross_income: 90_000 },
      { year: 2027, gross_income: 95_000 },
    ];
    const result = mergeTimeline(fresh, existing);
    expect(result).toEqual(fresh);
  });

  it("preserves years with notes", () => {
    const fresh = [
      { year: 2026, gross_income: 100_000 },
      { year: 2027, gross_income: 110_000 },
    ];
    const existing = [
      { year: 2026, gross_income: 50_000, notes: "sabbatical" },
      { year: 2027, gross_income: 95_000 },
    ];
    const result = mergeTimeline(fresh, existing);
    expect(result[0].gross_income).toBe(50_000);
    expect(result[0].notes).toBe("sabbatical");
    expect(result[1].gross_income).toBe(110_000);
  });

  it("preserves years with state override", () => {
    const fresh = [
      { year: 2026, gross_income: 100_000 },
      { year: 2027, gross_income: 110_000 },
    ];
    const existing = [
      { year: 2026, gross_income: 100_000 },
      { year: 2027, gross_income: 80_000, state: "TX" },
    ];
    const result = mergeTimeline(fresh, existing);
    expect(result[1].gross_income).toBe(80_000);
    expect(result[1].state).toBe("TX");
  });

  it("handles fresh timeline longer than existing", () => {
    const fresh = [
      { year: 2026, gross_income: 100_000 },
      { year: 2027, gross_income: 110_000 },
      { year: 2028, gross_income: 120_000 },
    ];
    const existing = [{ year: 2026, gross_income: 50_000, notes: "keep" }];
    const result = mergeTimeline(fresh, existing);
    expect(result).toHaveLength(3);
    expect(result[0].gross_income).toBe(50_000);
    expect(result[2].gross_income).toBe(120_000);
  });
});
