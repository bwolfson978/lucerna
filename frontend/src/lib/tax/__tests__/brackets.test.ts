/**
 * Parity tests for client-side tax module.
 * Test cases mirror backend/tests/engine/test_tax.py.
 */

import { describe, it, expect } from "vitest";
import { calculateFederalTax, analyzeBracketFill } from "../brackets";

describe("calculateFederalTax", () => {
  it("returns 0 for zero income", () => {
    expect(calculateFederalTax(0)).toBe(0);
  });

  it("returns 0 below standard deduction", () => {
    // $10K gross < $15K deduction → $0 taxable
    expect(calculateFederalTax(10000)).toBe(0);
  });

  it("single: 10% bracket only", () => {
    // $20K gross - $15K deduction = $5K taxable → $500
    expect(calculateFederalTax(20000)).toBeCloseTo(500, 0);
  });

  it("single: spans 10% and 12% brackets", () => {
    // $50K gross - $15K deduction = $35K taxable
    // $11,925 * 10% = $1,192.50 + ($35K - $11,925) * 12% = $2,769
    // Total: $3,961.50
    expect(calculateFederalTax(50000)).toBeCloseTo(3961.5, 0);
  });

  it("MFJ: wider brackets, lower tax", () => {
    // $50K gross - $30K deduction = $20K taxable, all in 10% = $2,000
    expect(calculateFederalTax(50000, "married_filing_jointly")).toBeCloseTo(
      2000,
      0
    );
  });

  it("MFJ: spans 10% and 12%", () => {
    // $100K gross - $30K deduction = $70K taxable
    // $23,850 * 10% = $2,385 + ($70K - $23,850) * 12% = $5,538
    // Total: $7,923
    expect(calculateFederalTax(100000, "married_filing_jointly")).toBeCloseTo(
      7923,
      0
    );
  });

  it("MFJ yields lower tax than single at same income", () => {
    const single = calculateFederalTax(100000, "single");
    const mfj = calculateFederalTax(100000, "married_filing_jointly");
    expect(mfj).toBeLessThan(single);
  });
});

describe("analyzeBracketFill", () => {
  it("conversion fills brackets beyond income", () => {
    // $20K income + $40K conversion
    const results = analyzeBracketFill(20000, 40000, "single");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].filled_by_income).toBeGreaterThan(0);
    expect(results[1].filled_by_conversion).toBeGreaterThan(0);
  });

  it("zero conversion shows no conversion fill", () => {
    const results = analyzeBracketFill(50000, 0, "single");
    for (const r of results) {
      expect(r.filled_by_conversion).toBe(0);
    }
  });

  it("bracket rates are ascending", () => {
    const results = analyzeBracketFill(50000, 100000, "single");
    const rates = results.map((r) => r.bracket_rate);
    expect(rates).toEqual([...rates].sort((a, b) => a - b));
  });

  it("income + conversion = total filled across all brackets", () => {
    const results = analyzeBracketFill(80000, 50000, "single");
    const totalIncome = results.reduce((s, r) => s + r.filled_by_income, 0);
    const totalConversion = results.reduce(
      (s, r) => s + r.filled_by_conversion,
      0
    );
    // Total filled should equal taxable income (gross - deduction)
    expect(totalIncome + totalConversion).toBeCloseTo(
      Math.max(0, 80000 + 50000 - 15000),
      0
    );
  });

  it("zero income and zero conversion returns single bracket", () => {
    const results = analyzeBracketFill(0, 0, "single");
    expect(results.length).toBe(1);
    expect(results[0].bracket_rate).toBe(0.1);
    expect(results[0].filled_by_income).toBe(0);
    expect(results[0].filled_by_conversion).toBe(0);
  });
});
