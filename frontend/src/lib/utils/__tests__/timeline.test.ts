import { describe, it, expect } from "vitest";
import { generateTimeline, mergeTimeline } from "../timeline";

describe("generateTimeline", () => {
  it("generates correct number of years until retirement", () => {
    const timeline = generateTimeline(35, 65, 100_000, 3);
    expect(timeline).toHaveLength(30);
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

  it("handles zero growth rate", () => {
    const timeline = generateTimeline(40, 45, 80_000, 0);
    expect(timeline).toHaveLength(5);
    for (const year of timeline) {
      expect(year.gross_income).toBe(80_000);
    }
  });

  it("handles already-retired (retAge <= currentAge)", () => {
    const timeline = generateTimeline(67, 65, 50_000, 0);
    // Should generate at least 1 year, up to 73 - currentAge
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline.length).toBeLessThanOrEqual(10);
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
    const existing = [
      { year: 2026, gross_income: 50_000, notes: "keep" },
    ];
    const result = mergeTimeline(fresh, existing);
    expect(result).toHaveLength(3);
    expect(result[0].gross_income).toBe(50_000);
    expect(result[2].gross_income).toBe(120_000);
  });
});
