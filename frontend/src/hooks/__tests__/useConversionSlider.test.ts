import { describe, it, expect } from "vitest";
import { distributeConversion } from "../useConversionSlider";
import type { ConversionCurvePoint } from "@/lib/types";

function makeCurvePoint(
  cap: number,
  conversions: number[]
): ConversionCurvePoint {
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

  describe("snap to nearest curve point", () => {
    const curve: ConversionCurvePoint[] = [
      makeCurvePoint(0, [0, 0, 0]),
      makeCurvePoint(25000, [15000, 10000, 0]),
      makeCurvePoint(50000, [35000, 15000, 0]),
      makeCurvePoint(75000, [45000, 25000, 5000]),
      makeCurvePoint(100000, [60000, 40000, 0]),
    ];

    it("returns zeros when totalConversion is 0", () => {
      const result = distributeConversion(0, weights, curve);
      expect(result).toEqual([0, 0, 0]);
    });

    it("uses exact curve point when slider matches", () => {
      const result = distributeConversion(25000, weights, curve);
      expect(result).toEqual([15000, 10000, 0]);
    });

    it("snaps to nearest curve point and scales to match total", () => {
      // 30000 is closer to 25000 (dist=5000) than to 50000 (dist=20000)
      // So snaps to 25000's allocation [15000, 10000, 0] and scales by 30000/25000
      const result = distributeConversion(30000, weights, curve);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(30000);
      // Ratio should match the 25000 point: 15000/10000 = 1.5
      expect(result[0] / result[1]).toBeCloseTo(1.5);
    });

    it("preserves allocation ratios from nearest point", () => {
      // 70000 is closer to 75000 (dist=5000) than to 50000 (dist=20000)
      // So snaps to 75000's allocation [45000, 25000, 5000]
      const result = distributeConversion(70000, weights, curve);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(70000);
      // Ratios from 75000 point: 45000:25000:5000 = 9:5:1
      expect(result[0] / result[2]).toBeCloseTo(9);
    });

    it("clamps to first point when below range", () => {
      const result = distributeConversion(-100, weights, curve);
      expect(result).toEqual([0, 0, 0]);
    });

    it("scales up from last point when above range", () => {
      const result = distributeConversion(150000, weights, curve);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(150000);
      // Ratio matches last curve point (60000:40000 = 3:2)
      expect(result[0] / result[1]).toBeCloseTo(60000 / 40000);
    });

    it("never produces small spurious amounts from interpolation", () => {
      // Regression test for GitHub issue #59: lerp between curve points
      // with different allocation strategies used to produce tiny amounts.
      // With snap-to-nearest, this can't happen — we always use a real
      // DP allocation's ratios.
      const artifactCurve: ConversionCurvePoint[] = [
        makeCurvePoint(0, [0, 0, 0, 0]),
        makeCurvePoint(40000, [40000, 0, 0, 0]),
        // At 50000, allocation shifts to include year 2
        makeCurvePoint(50000, [30000, 20000, 0, 0]),
        makeCurvePoint(100000, [50000, 40000, 10000, 0]),
      ];

      // Just above the 40000 point — old lerp would produce a tiny year-2 amount.
      // With snap-to-nearest, we get 40000's allocation scaled up.
      const result = distributeConversion(41000, weights.concat(0), artifactCurve);

      // Year 2 should be 0 (snapped to 40000's strategy [40000, 0, 0, 0])
      expect(result[1]).toBe(0);
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
