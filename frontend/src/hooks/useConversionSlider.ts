import { useState, useMemo } from "react";
import type {
  OptimizationResult,
  ConversionCurvePoint,
  BracketFillResult,
  YearlyDetail,
} from "@/lib/types";
import { analyzeBracketFill, calculateFederalTax } from "@/lib/tax/brackets";
import { useTaxConfig } from "@/lib/tax/TaxConfigProvider";
import { computeSnapThreshold } from "@/lib/utils/snap";

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

  // Sort the conversion curve once — reused by both distributeConversion
  // and estimatedSavings interpolation.
  const sortedCurve = useMemo(
    () =>
      result.conversion_curve && result.conversion_curve.length >= 2
        ? [...result.conversion_curve].sort((a, b) => a.total_cap - b.total_cap)
        : undefined,
    [result.conversion_curve]
  );

  const yearlyConversions = useMemo(
    () =>
      distributeConversion(
        totalConversion,
        result.yearly_conversions,
        sortedCurve,
        result.input.traditional_ira_balance,
        result.total_conversion
      ),
    [
      totalConversion,
      result.yearly_conversions,
      sortedCurve,
      result.input.traditional_ira_balance,
      result.total_conversion,
    ]
  );

  const yearlyBracketFills: BracketFillResult[][] = useMemo(
    () =>
      incomes.map((income, i) =>
        analyzeBracketFill(income, yearlyConversions[i] ?? 0, filingStatus, taxConfig)
      ),
    [incomes, yearlyConversions, filingStatus, taxConfig]
  );

  const yearlyDetail: YearlyDetail[] = useMemo(
    () =>
      incomes.map((income, i) => {
        const conversion = yearlyConversions[i] ?? 0;
        const taxWith = calculateFederalTax(income + conversion, filingStatus, taxConfig);
        const taxWithout = calculateFederalTax(income, filingStatus, taxConfig);
        const taxCost = taxWith - taxWithout;
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
      yearlyConversions,
      yearlyBracketFills,
      filingStatus,
      taxConfig,
      result.input.timeline,
    ]
  );

  const displayTotalConversion = yearlyConversions.reduce((a, b) => a + b, 0);
  const totalTaxCost = yearlyDetail.reduce((s, d) => s + d.tax_cost, 0);
  const conversionYears = yearlyConversions.filter((c) => c > 0).length;

  // Interpolate NPV-based estimated savings from pre-computed conversion curve.
  // When near the optimizer's result, snap to the authoritative backend value
  // so hero metric and scenario cards always agree.
  const estimatedSavings = useMemo(() => {
    // Snap to backend value when at (or very near) the optimizer's answer
    const snapThreshold = computeSnapThreshold(
      0,
      Math.max(result.input.traditional_ira_balance, result.total_conversion)
    );
    if (Math.abs(totalConversion - result.total_conversion) <= snapThreshold) {
      return result.estimated_lifetime_tax_savings;
    }

    if (!sortedCurve || sortedCurve.length === 0) {
      return result.estimated_lifetime_tax_savings;
    }

    const npvAtZero = result.npv_at_zero;

    // Find bounding points for linear interpolation
    if (totalConversion <= sortedCurve[0].total_cap) {
      return sortedCurve[0].npv - npvAtZero;
    }
    if (totalConversion >= sortedCurve[sortedCurve.length - 1].total_cap) {
      return sortedCurve[sortedCurve.length - 1].npv - npvAtZero;
    }

    for (let i = 0; i < sortedCurve.length - 1; i++) {
      if (
        sortedCurve[i].total_cap <= totalConversion &&
        sortedCurve[i + 1].total_cap >= totalConversion
      ) {
        const range = sortedCurve[i + 1].total_cap - sortedCurve[i].total_cap;
        const t = range > 0 ? (totalConversion - sortedCurve[i].total_cap) / range : 0;
        const interpolatedNpv =
          sortedCurve[i].npv + t * (sortedCurve[i + 1].npv - sortedCurve[i].npv);
        return interpolatedNpv - npvAtZero;
      }
    }

    return result.estimated_lifetime_tax_savings;
  }, [
    sortedCurve,
    result.npv_at_zero,
    result.estimated_lifetime_tax_savings,
    result.total_conversion,
    totalConversion,
  ]);

  return {
    totalConversion,
    setTotalConversion,
    yearlyConversions,
    yearlyBracketFills,
    yearlyDetail,
    displayTotalConversion,
    totalTaxCost,
    conversionYears,
    estimatedSavings,
  };
}
