import { useState, useMemo } from "react";
import type {
  OptimizationResult,
  ConversionCurvePoint,
  BracketFillResult,
  YearlyDetail,
} from "@/lib/types";
import { analyzeBracketFill, calculateFederalTax } from "@/lib/tax/brackets";
import { useTaxConfig } from "@/lib/tax/TaxConfigProvider";
import { sampleCurve } from "@lucerna/ui";
import { curveData } from "@/lib/results/viewData";

/**
 * Find the two curve points that bound a given total conversion and
 * return them along with the interpolation parameter t ∈ [0, 1].
 *
 * Expects `sorted` to be ordered by ascending `total_cap`.
 */
function findBoundingPoints(
  totalConversion: number,
  sorted: ConversionCurvePoint[]
): { lower: ConversionCurvePoint; upper: ConversionCurvePoint; t: number } {
  // Clamp to endpoints
  if (totalConversion <= sorted[0].total_cap) {
    return { lower: sorted[0], upper: sorted[0], t: 0 };
  }
  if (totalConversion >= sorted[sorted.length - 1].total_cap) {
    return { lower: sorted[sorted.length - 1], upper: sorted[sorted.length - 1], t: 0 };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].total_cap <= totalConversion && sorted[i + 1].total_cap >= totalConversion) {
      const range = sorted[i + 1].total_cap - sorted[i].total_cap;
      const t = range > 0 ? (totalConversion - sorted[i].total_cap) / range : 0;
      return { lower: sorted[i], upper: sorted[i + 1], t };
    }
  }

  // Fallback (shouldn't reach here)
  return { lower: sorted[sorted.length - 1], upper: sorted[sorted.length - 1], t: 0 };
}

/** Threshold below which interpolation artifacts are zeroed out. */
const LERP_ZERO_THRESHOLD = 100;

export function distributeConversion(
  totalConversion: number,
  optimizerWeights: number[],
  sortedCurve?: ConversionCurvePoint[],
  iraBalance?: number,
  optimizerTotal?: number
): number[] {
  if (totalConversion === 0) return optimizerWeights.map(() => 0);

  // When at the optimizer's optimal total, use the authoritative result
  // directly — it comes from the 2D DP and has no interpolation artifacts.
  if (optimizerTotal !== undefined && Math.abs(totalConversion - optimizerTotal) < 1) {
    return optimizerWeights.map((w) => Math.max(0, w));
  }

  // Interpolate between the two bounding curve points for smooth slider
  // behavior.  Each curve point is a real allocation for its budget cap;
  // lerping yearly amounts produces a smooth transition between strategies.
  if (sortedCurve && sortedCurve.length >= 2) {
    const { lower, upper, t } = findBoundingPoints(totalConversion, sortedCurve);

    let lerped = lower.yearly_conversions.map((lc, i) => {
      const uc = upper.yearly_conversions[i] ?? 0;
      return Math.max(0, lc + t * (uc - lc));
    });

    // Zero out tiny interpolation artifacts where one bounding point has
    // zero and the other has a small allocation (GitHub issue #59).
    lerped = lerped.map((c) => (c < LERP_ZERO_THRESHOLD ? 0 : c));

    // Scale so total matches slider value exactly.
    const lerpedTotal = lerped.reduce((a, b) => a + b, 0);
    if (lerpedTotal > 0 && Math.abs(lerpedTotal - totalConversion) > 1) {
      const scale = totalConversion / lerpedTotal;
      lerped = lerped.map((c) => c * scale);
    } else if (lerpedTotal === 0 && totalConversion > 0) {
      // All curve points near here are zero — distribute uniformly
      const perYear = totalConversion / lerped.length;
      lerped = lerped.map(() => perYear);
    }

    // Cap each year at IRA balance
    if (iraBalance !== undefined) {
      lerped = lerped.map((c) => Math.min(c, iraBalance));
    }

    return lerped;
  }

  // Fallback: proportional scaling
  const weightTotal = optimizerWeights.reduce((a, b) => a + b, 0);
  if (weightTotal === 0) {
    const perYear = totalConversion / optimizerWeights.length;
    return optimizerWeights.map(() => perYear);
  }
  const scale = totalConversion / weightTotal;
  return optimizerWeights.map((w) => Math.max(0, w * scale));
}

interface UseConversionSliderParams {
  result: OptimizationResult;
}

export function useConversionSlider({ result }: UseConversionSliderParams) {
  const [totalConversion, setTotalConversion] = useState(result.total_conversion);

  const taxConfig = useTaxConfig();
  const filingStatus = result.input.filing_status;
  const incomes = useMemo(
    () => result.input.timeline.map((yi) => yi.gross_income),
    [result.input.timeline]
  );

  // The same curve points the result card gets (web chat, Claude, ChatGPT), sampled the
  // same way (sampleCurve), so the card and this page show the same numbers at every
  // total. At the optimal total, the engine's own schedule.
  const curve = useMemo(() => curveData(result), [result]);
  const atOptimal = Math.abs(totalConversion - result.total_conversion) < 1;
  const sample = useMemo(
    () => (curve && !atOptimal ? sampleCurve(curve, totalConversion) : null),
    [curve, atOptimal, totalConversion]
  );

  const yearlyConversions = useMemo(() => {
    if (atOptimal) return result.yearly_conversions.map((w) => Math.max(0, w));
    if (sample) return sample.conversions;
    // Older results without a curve: scale the optimal schedule.
    return distributeConversion(totalConversion, result.yearly_conversions);
  }, [atOptimal, sample, totalConversion, result.yearly_conversions]);

  // Each year's required withdrawal, which the conversion sits on top of.
  const yearlyRmds = useMemo(() => {
    if (sample) return sample.rmds;
    const byYear = new Map(
      (result.rmd_projection?.yearly_detail ?? []).map((d) => [d.year, d.rmd_amount])
    );
    return result.input.timeline.map((yi) => byYear.get(yi.year) ?? 0);
  }, [sample, result]);

  // Bracket fill uses income + RMD as the base so the conversion is layered
  // onto the correct starting income position in the bracket chart.
  const yearlyBracketFills: BracketFillResult[][] = useMemo(
    () =>
      incomes.map((income, i) =>
        analyzeBracketFill(
          income + (yearlyRmds[i] ?? 0),
          yearlyConversions[i] ?? 0,
          filingStatus,
          taxConfig
        )
      ),
    [incomes, yearlyRmds, yearlyConversions, filingStatus, taxConfig]
  );

  // Each year's tax from the engine (federal and state, that year's own brackets), so the
  // years add up to the total. Null for older results without it.
  const engineYearTaxes = useMemo(() => {
    if (sample) return sample.taxes ?? null;
    if (!atOptimal) return null;
    const detail = result.yearly_detail;
    return detail?.length === result.input.timeline.length &&
      detail.every((d) => typeof d.tax_cost === "number")
      ? detail.map((d) => d.tax_cost)
      : null;
  }, [sample, atOptimal, result]);

  // Without the engine's figures, the federal tax with income + RMD as the base.
  const yearlyDetail: YearlyDetail[] = useMemo(
    () =>
      incomes.map((income, i) => {
        const rmd = yearlyRmds[i] ?? 0;
        const conversion = yearlyConversions[i] ?? 0;
        const base = income + rmd;
        const taxCost = engineYearTaxes
          ? (engineYearTaxes[i] ?? 0)
          : calculateFederalTax(base + conversion, filingStatus, taxConfig) -
            calculateFederalTax(base, filingStatus, taxConfig);
        // Find marginal bracket rate from the bracket fill data
        const fills = yearlyBracketFills[i];
        const topFilled = fills
          ? [...fills].reverse().find((f) => f.filled_by_income + f.filled_by_conversion > 0)
          : null;
        const marginalRate = topFilled ? topFilled.bracket_rate : 0.1;

        return {
          year: result.input.timeline[i].year,
          income,
          conversion: Math.round(conversion),
          tax_cost: Math.round(taxCost * 100) / 100,
          marginal_bracket: marginalRate,
        };
      }),
    [
      incomes,
      yearlyRmds,
      yearlyConversions,
      yearlyBracketFills,
      engineYearTaxes,
      filingStatus,
      taxConfig,
      result.input.timeline,
    ]
  );

  const displayTotalConversion = yearlyConversions.reduce((a, b) => a + b, 0);
  // The engine's total tax (federal and state), the number the card and the assistant
  // report; the years above add up to it, give or take rounding.
  const totalTaxCost = atOptimal
    ? result.total_tax_on_conversions
    : sample
      ? sample.tax
      : yearlyDetail.reduce((s, d) => s + d.tax_cost, 0);
  const conversionYears = yearlyConversions.filter((c) => Math.round(c) > 0).length;
  const estimatedSavings = sample ? sample.savings : result.estimated_lifetime_tax_savings;

  return {
    totalConversion,
    setTotalConversion,
    yearlyConversions,
    yearlyBracketFills,
    yearlyDetail,
    yearlyRmds,
    displayTotalConversion,
    totalTaxCost,
    conversionYears,
    estimatedSavings,
  };
}
