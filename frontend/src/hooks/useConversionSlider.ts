import { useState, useMemo } from "react";
import type {
  OptimizationResult,
  ConversionCurvePoint,
  BracketFillResult,
  FilingStatus,
  YearlyDetail,
} from "@/lib/types";
import {
  analyzeBracketFill,
  calculateFederalTax,
} from "@/lib/tax/brackets";
import { computeSnapThreshold } from "@/lib/utils/snap";

/**
 * Find the nearest curve point to a given total conversion.
 * Returns the curve point whose total_cap is closest.
 */
function findNearestCurvePoint(
  totalConversion: number,
  sorted: ConversionCurvePoint[]
): ConversionCurvePoint {
  let bestIdx = 0;
  let bestDist = Math.abs(sorted[0].total_cap - totalConversion);
  for (let i = 1; i < sorted.length; i++) {
    const dist = Math.abs(sorted[i].total_cap - totalConversion);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return sorted[bestIdx];
}

export function distributeConversion(
  totalConversion: number,
  optimizerWeights: number[],
  conversionCurve?: ConversionCurvePoint[],
  iraBalance?: number,
  optimizerTotal?: number
): number[] {
  if (totalConversion === 0) return optimizerWeights.map(() => 0);

  // When at the optimizer's optimal total, use the authoritative result
  // directly — it comes from the 2D DP and has no interpolation artifacts.
  if (
    optimizerTotal !== undefined &&
    Math.abs(totalConversion - optimizerTotal) < 1
  ) {
    return optimizerWeights.map((w) => Math.max(0, w));
  }

  // Snap to nearest pre-computed curve point.  Each curve point is a real
  // DP-optimal allocation for that budget cap — no blending between
  // different strategies, so no spurious small amounts appear.
  if (conversionCurve && conversionCurve.length >= 2) {
    const sorted = [...conversionCurve].sort(
      (a, b) => a.total_cap - b.total_cap
    );

    const nearest = findNearestCurvePoint(totalConversion, sorted);
    let snapped = nearest.yearly_conversions.map((c) => Math.max(0, c));

    // Scale the snapped allocation so the total matches the slider value.
    // This preserves the DP-optimal year ratios while keeping the displayed
    // total consistent with the slider position.
    const snappedTotal = snapped.reduce((a, b) => a + b, 0);
    if (snappedTotal > 0 && Math.abs(snappedTotal - totalConversion) > 1) {
      const scale = totalConversion / snappedTotal;
      snapped = snapped.map((c) => c * scale);
    } else if (snappedTotal === 0 && totalConversion > 0) {
      // All curve points near here are zero — distribute uniformly
      const perYear = totalConversion / snapped.length;
      snapped = snapped.map(() => perYear);
    }

    // Cap each year at IRA balance
    if (iraBalance !== undefined) {
      snapped = snapped.map((c) => Math.min(c, iraBalance));
    }

    return snapped;
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
  const [totalConversion, setTotalConversion] = useState(
    result.total_conversion
  );

  const filingStatus = result.input.filing_status;
  const incomes = useMemo(
    () => result.input.income_trajectory.map((yi) => yi.gross_income),
    [result.input.income_trajectory]
  );

  const yearlyConversions = useMemo(
    () =>
      distributeConversion(
        totalConversion,
        result.yearly_conversions,
        result.conversion_curve,
        result.input.traditional_ira_balance,
        result.total_conversion
      ),
    [totalConversion, result.yearly_conversions, result.conversion_curve, result.input.traditional_ira_balance, result.total_conversion]
  );

  const yearlyBracketFills: BracketFillResult[][] = useMemo(
    () =>
      incomes.map((income, i) =>
        analyzeBracketFill(income, yearlyConversions[i] ?? 0, filingStatus)
      ),
    [incomes, yearlyConversions, filingStatus]
  );

  const yearlyDetail: YearlyDetail[] = useMemo(
    () =>
      incomes.map((income, i) => {
        const conversion = yearlyConversions[i] ?? 0;
        const taxWith = calculateFederalTax(income + conversion, filingStatus);
        const taxWithout = calculateFederalTax(income, filingStatus);
        const taxCost = taxWith - taxWithout;
        // Find marginal bracket rate from the bracket fill data
        const fills = yearlyBracketFills[i];
        const topFilled = fills
          ? [...fills]
              .reverse()
              .find(
                (f) => f.filled_by_income + f.filled_by_conversion > 0
              )
          : null;
        const marginalRate = topFilled ? topFilled.bracket_rate : 0.1;

        return {
          year: result.input.income_trajectory[i].year,
          income,
          conversion: Math.round(conversion),
          tax_cost: Math.round(taxCost * 100) / 100,
          marginal_bracket: marginalRate,
        };
      }),
    [incomes, yearlyConversions, yearlyBracketFills, filingStatus, result.input.income_trajectory]
  );

  const displayTotalConversion = yearlyConversions.reduce((a, b) => a + b, 0);
  const totalTaxCost = yearlyDetail.reduce((s, d) => s + d.tax_cost, 0);
  const conversionYears = yearlyConversions.filter((c) => c > 0).length;

  // Interpolate NPV-based estimated savings from pre-computed conversion curve.
  // When near the optimizer's result, snap to the authoritative backend value
  // so hero metric and scenario cards always agree.
  const estimatedSavings = useMemo(() => {
    // Snap to backend value when at (or very near) the optimizer's answer
    const snapThreshold = computeSnapThreshold(0, Math.max(result.input.traditional_ira_balance, result.total_conversion));
    if (Math.abs(totalConversion - result.total_conversion) <= snapThreshold) {
      return result.estimated_lifetime_tax_savings;
    }

    const curve = result.conversion_curve;
    if (!curve || curve.length === 0) {
      return result.estimated_lifetime_tax_savings;
    }

    const sorted = [...curve].sort((a, b) => a.total_cap - b.total_cap);
    const npvAtZero = result.npv_at_zero;

    // Find bounding points for linear interpolation
    if (totalConversion <= sorted[0].total_cap) {
      return sorted[0].npv - npvAtZero;
    }
    if (totalConversion >= sorted[sorted.length - 1].total_cap) {
      return sorted[sorted.length - 1].npv - npvAtZero;
    }

    for (let i = 0; i < sorted.length - 1; i++) {
      if (
        sorted[i].total_cap <= totalConversion &&
        sorted[i + 1].total_cap >= totalConversion
      ) {
        const range = sorted[i + 1].total_cap - sorted[i].total_cap;
        const t =
          range > 0
            ? (totalConversion - sorted[i].total_cap) / range
            : 0;
        const interpolatedNpv =
          sorted[i].npv + t * (sorted[i + 1].npv - sorted[i].npv);
        return interpolatedNpv - npvAtZero;
      }
    }

    return result.estimated_lifetime_tax_savings;
  }, [
    result.conversion_curve,
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
