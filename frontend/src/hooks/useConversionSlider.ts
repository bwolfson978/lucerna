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

function distributeConversion(
  totalConversion: number,
  optimizerWeights: number[]
): number[] {
  const optimizerTotal = optimizerWeights.reduce((a, b) => a + b, 0);

  if (optimizerTotal === 0 || totalConversion === 0) {
    // Uniform distribution if optimizer allocated nothing, or slider is at 0
    if (totalConversion === 0) return optimizerWeights.map(() => 0);
    const perYear = totalConversion / optimizerWeights.length;
    return optimizerWeights.map(() => perYear);
  }

  const scale = totalConversion / optimizerTotal;
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
    () => distributeConversion(totalConversion, result.yearly_conversions),
    [totalConversion, result.yearly_conversions]
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
        const effectiveRate = conversion > 0 ? taxCost / conversion : 0;
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
          effective_rate: Math.round(effectiveRate * 10000) / 10000,
          marginal_bracket: marginalRate,
        };
      }),
    [incomes, yearlyConversions, yearlyBracketFills, filingStatus, result.input.income_trajectory]
  );

  const displayTotalConversion = yearlyConversions.reduce((a, b) => a + b, 0);
  const totalTaxCost = yearlyDetail.reduce((s, d) => s + d.tax_cost, 0);
  const effectiveRate =
    displayTotalConversion > 0 ? totalTaxCost / displayTotalConversion : 0;
  const conversionYears = yearlyConversions.filter((c) => c > 0).length;

  // Interpolate NPV-based estimated savings from pre-computed conversion curve.
  // When near the optimizer's result, snap to the authoritative backend value
  // so hero metric and scenario cards always agree.
  const estimatedSavings = useMemo(() => {
    // Snap to backend value when at (or very near) the optimizer's answer
    if (Math.abs(totalConversion - result.total_conversion) < 100) {
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
    effectiveRate,
    conversionYears,
    estimatedSavings,
  };
}
