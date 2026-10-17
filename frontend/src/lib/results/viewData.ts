/**
 * Data for the shared cards (ui/) from full engine results, in the same shapes (and
 * rounding) the MCP server gives its Views: structuredContent (backend
 * app/tools/core.py) and View `_meta` (backend app/tools/views.py). Native cards and
 * Views then render identical numbers; shared/fixtures/view-data.json checks it.
 */

import type {
  BracketFillData,
  ConversionCurveData,
  ResultCardData,
  ResultDetails,
  ScenarioCompareData,
  TaxBreakdown,
  ScenarioSummaryData,
} from "@lucerna/ui";
import type { OptimizationResult } from "@/lib/types";
import type { ScenarioDraft } from "@/lib/scenario/draft";
import { getFallbackTaxConfig } from "@/lib/tax/TaxConfigProvider";

const round = Math.round;

function years(result: OptimizationResult): number[] {
  return result.input.timeline.map((t) => t.year);
}

export function resultCardData(resultId: string, result: OptimizationResult): ResultCardData {
  const ys = years(result);
  return {
    result_id: resultId,
    estimated_lifetime_tax_savings_todays_dollars: round(result.estimated_lifetime_tax_savings),
    total_conversion: round(result.total_conversion),
    total_tax_on_conversions: round(result.total_tax_on_conversions),
    years_with_conversions: result.yearly_conversions.filter((c) => c > 0).length,
    schedule_by_year: result.yearly_conversions.map((c, i) => ({
      year: ys[i],
      conversion: round(c),
    })),
  };
}

export function bracketFillData(result: OptimizationResult): BracketFillData {
  const rmdByYear = new Map(
    (result.rmd_projection?.yearly_detail ?? []).map((d) => [d.year, d.rmd_amount])
  );
  const tax = getFallbackTaxConfig();
  const status = result.input.filing_status;
  return {
    years: result.input.timeline.map((plan, i) => {
      const fill = result.yearly_bracket_fill[i] ?? [];
      return {
        year: plan.year,
        age: result.input.age + i,
        income: round(plan.gross_income),
        rmd: round(rmdByYear.get(plan.year) ?? 0),
        conversion: round(result.yearly_conversions[i] ?? 0),
        tax: round(fill.reduce((sum, b) => sum + b.bracket_rate * b.filled_by_conversion, 0)),
      };
    }),
    brackets: tax.brackets[status].map((b) => ({
      rate: b.rate,
      min: round(b.min),
      max: b.max == null ? null : round(b.max),
    })),
    standard_deduction: round(tax.standard_deduction[status]),
  };
}

/** Points the card's slider gets (backend app/tools/views.py CURVE_VIEW_POINTS). */
const CURVE_VIEW_POINTS = 40;

/** Mirrors backend app/tools/views.py curve_points: the point nearest each of 41 evenly
 * spaced totals, plus the optimal schedule's own point. */
function curvePoints(result: OptimizationResult) {
  const points = [...(result.conversion_curve ?? [])].sort((a, b) => a.total_cap - b.total_cap);
  if (points.length < 2) return [];
  const top = points[points.length - 1].total_cap;
  const chosen = new Set<number>();
  for (let k = 0; k <= CURVE_VIEW_POINTS; k++) {
    const target = (top * k) / CURVE_VIEW_POINTS;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.total_cap - target) < Math.abs(points[nearest].total_cap - target)) {
        nearest = i;
      }
    });
    chosen.add(nearest);
  }
  points.forEach((p, i) => {
    if (Math.abs(p.total_cap - result.total_conversion) < 1) chosen.add(i);
  });
  return Array.from(chosen)
    .sort((a, b) => a - b)
    .map((i) => points[i]);
}

/** Rounds like Python: never -0, which toEqual tells apart from the server's 0. */
const roundInt = (v: number) => round(v) + 0;

/** Mirrors backend app/tools/views.py curve_view. */
export function curveData(result: OptimizationResult): ConversionCurveData | undefined {
  const points = curvePoints(result);
  if (points.length === 0) return undefined;
  return {
    points: points.map((p) => ({
      total: roundInt(p.total_cap),
      savings: roundInt(p.npv - result.npv_at_zero),
      tax: roundInt(p.total_tax),
      conversions: p.yearly_conversions.map(roundInt),
      rmds: (p.yearly_rmd_amounts ?? []).map(roundInt),
    })),
  };
}

export function resultDetails(result: OptimizationResult): ResultDetails {
  const curve = curveData(result);
  return { bracket_fill: bracketFillData(result), ...(curve && { curve }) };
}

/** Mirrors backend app/tools/core.py _tax_breakdown. */
function taxBreakdown(result: OptimizationResult): TaxBreakdown {
  const paid = round(result.conversion_cost_today ?? 0);
  return { paid_now: paid, avoided_later: paid + round(result.estimated_lifetime_tax_savings) };
}

export function compareData(
  baseId: string,
  base: OptimizationResult,
  variantId: string,
  variant: OptimizationResult,
  label: string
): ScenarioCompareData {
  const byYear = (r: OptimizationResult) =>
    new Map(years(r).map((y, i) => [y, r.yearly_conversions[i] ?? 0]));
  const a = byYear(base);
  const b = byYear(variant);
  const allYears = Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => x - y);
  return {
    label,
    base_result_id: baseId,
    variant_result_id: variantId,
    estimated_lifetime_tax_savings: {
      current: round(base.estimated_lifetime_tax_savings),
      what_if: round(variant.estimated_lifetime_tax_savings),
      difference: round(
        variant.estimated_lifetime_tax_savings - base.estimated_lifetime_tax_savings
      ),
    },
    tax_breakdown: { current: taxBreakdown(base), what_if: taxBreakdown(variant) },
    conversions_by_year: allYears.map((y) => ({
      year: y,
      current: round(a.get(y) ?? 0),
      what_if: round(b.get(y) ?? 0),
    })),
  };
}

export function summaryData(draft: ScenarioDraft): ScenarioSummaryData {
  const { timeline, ...scenario } = draft;
  return {
    scenario,
    timeline: timeline.map((y) => ({ year: y.year, gross_income: y.gross_income, note: y.notes })),
  };
}
