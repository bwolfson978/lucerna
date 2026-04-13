import { describe, it, expect } from "vitest";
import { distributeConversion } from "../useConversionSlider";
import type { ConversionCurvePoint } from "@/lib/types";

function makeCurvePoint(cap: number, conversions: number[]): ConversionCurvePoint {
  return {
    total_cap: cap,
    yearly_conversions: conversions,
    yearly_bracket_fill: [],
    yearly_detail: [],
    total_tax: 0,
    npv: 0,
  };
}

describe("distributeConversion", () => {
  const weights = [60000, 40000, 0];

  describe("authoritative optimal result", () => {
    const curve: ConversionCurvePoint[] = [
      makeCurvePoint(0, [0, 0, 0]),
      makeCurvePoint(50000, [30000, 20000, 0]),
      makeCurvePoint(100000, [60000, 40000, 0]),
    ];

    it("returns optimizer weights directly when at optimal total", () => {
      const result = distributeConversion(100000, weights, curve, undefined, 100000);
      expect(result).toEqual([60000, 40000, 0]);
    });

    it("returns optimizer weights when within 1 dollar of optimal", () => {
      const result = distributeConversion(99999.5, weights, curve, undefined, 100000);
      expect(result).toEqual([60000, 40000, 0]);
    });

    it("does NOT use optimizer weights when far from optimal", () => {
      const result = distributeConversion(50000, weights, curve, undefined, 100000);
      // Should snap to nearest curve point, not use optimizer weights
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(50000);
    });
  });

  describe("interpolation between curve points", () => {
    const curve: ConversionCurvePoint[] = [
      makeCurvePoint(0, [0, 0, 0]),
      makeCurvePoint(25000, [15000, 10000, 0]),
      makeCurvePoint(50000, [35000, 15000, 0]),
      makeCurvePoint(75000, [45000, 25000, 5000]),
      makeCurvePoint(100000, [60000, 40000, 0]),
    ].sort((a, b) => a.total_cap - b.total_cap);

    it("returns zeros when totalConversion is 0", () => {
      const result = distributeConversion(0, weights, curve);
      expect(result).toEqual([0, 0, 0]);
    });

    it("uses exact curve point when slider matches", () => {
      const result = distributeConversion(25000, weights, curve);
      expect(result).toEqual([15000, 10000, 0]);
    });

    it("lerps between bounding curve points and scales to match total", () => {
      // 30000 is between 25000 [15000, 10000, 0] and 50000 [35000, 15000, 0]
      // t = (30000 - 25000) / (50000 - 25000) = 0.2
      // lerp: [15000 + 0.2*20000, 10000 + 0.2*5000, 0] = [19000, 11000, 0]
      // total = 30000, matches slider — no scaling needed
      const result = distributeConversion(30000, weights, curve);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(30000);
      // Values should be interpolated between the two bounding points
      expect(result[0]).toBeCloseTo(19000, -2);
      expect(result[1]).toBeCloseTo(11000, -2);
    });

    it("produces smooth intermediate allocations between curve points", () => {
      // 62500 is exactly halfway between 50000 and 75000
      // lerp: [40000, 20000, 2500] — but 2500 > threshold so it stays
      const result = distributeConversion(62500, weights, curve);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(62500);
      // Year 0 should be between 35000 (at 50K) and 45000 (at 75K)
      expect(result[0]).toBeGreaterThan(35000);
      expect(result[0]).toBeLessThan(45000);
    });

    it("clamps to first point when below range", () => {
      const result = distributeConversion(-100, weights, curve);
      expect(result).toEqual([0, 0, 0]);
    });

    it("scales from last point when above range", () => {
      const result = distributeConversion(150000, weights, curve);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(150000);
      // Ratio matches last curve point (60000:40000 = 3:2)
      expect(result[0] / result[1]).toBeCloseTo(60000 / 40000);
    });

    it("zeroes out small interpolation artifacts (GitHub issue #59)", () => {
      // Regression test: lerp between curve points with different allocation
      // strategies can produce tiny amounts.  Values below the threshold
      // ($100) are zeroed out to prevent spurious bar segments.
      const artifactCurve: ConversionCurvePoint[] = [
        makeCurvePoint(0, [0, 0, 0, 0]),
        makeCurvePoint(40000, [40000, 0, 0, 0]),
        // At 50000, allocation shifts to include year 2
        makeCurvePoint(50000, [30000, 20000, 0, 0]),
        makeCurvePoint(100000, [50000, 40000, 10000, 0]),
      ].sort((a, b) => a.total_cap - b.total_cap);

      // Just above the 40000 point — lerp produces a tiny year-2 amount
      // that should be zeroed by the threshold.
      // t = (41000 - 40000) / (50000 - 40000) = 0.1
      // lerp year 1: 0 + 0.1 * 20000 = 2000 → above threshold, kept
      // But year 2 and 3 are zero on both sides → stay zero
      const result = distributeConversion(41000, weights.concat(0), artifactCurve);

      expect(result[2]).toBe(0);
      expect(result[3]).toBe(0);
      // Total should match slider
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(41000, -2);
    });

    it("caps each year at iraBalance when provided", () => {
      const result = distributeConversion(150000, weights, curve, 50000);
      result.forEach((c) => expect(c).toBeLessThanOrEqual(50000));
    });
  });

  describe("fallback (proportional scaling)", () => {
    it("scales proportionally without curve", () => {
      const result = distributeConversion(50000, weights);
      // scale = 50000 / 100000 = 0.5
      expect(result[0]).toBeCloseTo(30000);
      expect(result[1]).toBeCloseTo(20000);
      expect(result[2]).toBeCloseTo(0);
    });

    it("distributes uniformly when all weights are zero", () => {
      const result = distributeConversion(30000, [0, 0, 0]);
      expect(result[0]).toBeCloseTo(10000);
      expect(result[1]).toBeCloseTo(10000);
      expect(result[2]).toBeCloseTo(10000);
    });

    it("falls back when curve is empty", () => {
      const result = distributeConversion(50000, weights, []);
      expect(result[0]).toBeCloseTo(30000);
      expect(result[1]).toBeCloseTo(20000);
    });

    it("falls back when curve has only one point", () => {
      const singlePoint = [makeCurvePoint(50000, [30000, 20000, 0])];
      const result = distributeConversion(50000, weights, singlePoint);
      // Only 1 point — curve requires >= 2, falls back to proportional
      expect(result[0]).toBeCloseTo(30000);
      expect(result[1]).toBeCloseTo(20000);
    });
  });
});
