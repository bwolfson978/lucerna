/**
 * Data for the shared cards (ui/) from full engine results, in the same shapes (and
 * rounding) the MCP server gives its Views: structuredContent (backend
 * app/tools/core.py) and View `_meta` (backend app/tools/views.py). Native cards and
 * Views then render identical numbers; shared/fixtures/view-data.json checks it.
 */

import type {
  BalanceComparisonData,
  BracketFillData,
  ResultCardData,
  ResultDetails,
  ScenarioCompareData,
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
  return {
    years: result.input.timeline.map((plan, i) => {
      const fill = result.yearly_bracket_fill[i] ?? [];
      return {
        year: plan.year,
        income: round(fill.reduce((sum, b) => sum + b.filled_by_income, 0)),
        conversion: round(result.yearly_conversions[i] ?? 0),
        segments: fill
          .filter((b) => b.filled_by_conversion > 0.5)
          .map((b) => ({ rate: b.bracket_rate, amount: round(b.filled_by_conversion) })),
      };
    }),
    brackets: getFallbackTaxConfig().brackets[result.input.filing_status].map((b) => ({
      rate: b.rate,
      min: round(b.min),
      max: b.max == null ? null : round(b.max),
    })),
  };
}

export function balanceData(result: OptimizationResult): BalanceComparisonData {
  const withRmd = result.rmd_projection;
  const withoutRmd = result.rmd_projection_no_conversion;
  const withoutByAge = new Map(
    (withoutRmd?.yearly_detail ?? []).map((d) => [d.age, d.trad_balance_start])
  );
  return {
    roth_at_retirement: round(result.roth_at_retirement),
    peak_rmd_with: withRmd ? round(withRmd.peak_rmd_amount) : null,
    peak_rmd_without: withoutRmd ? round(withoutRmd.peak_rmd_amount) : null,
    after_tax_wealth_change: round(result.npv_at_optimal - result.npv_at_zero),
    points: (withRmd?.yearly_detail ?? []).map((d) => ({
      age: d.age,
      year: d.year,
      with: round(d.trad_balance_start),
      without: round(withoutByAge.get(d.age) ?? 0),
    })),
  };
}

export function resultDetails(result: OptimizationResult): ResultDetails {
  return { bracket_fill: bracketFillData(result) };
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
