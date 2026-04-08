"use client";

import type { AcaSubsidyDetail, OptimizationResult } from "@/lib/types";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { Card } from "@/components/ui/card";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";

interface AcaSubsidyImpactProps {
  result: OptimizationResult;
}

export function AcaSubsidyImpact({ result }: AcaSubsidyImpactProps) {
  const details = result.aca_subsidy_impact;
  const acaSummary = result.reasoning_trace.aca_summary;
  if (!details || details.length === 0 || !acaSummary) return null;

  const totalSubsidyLost = result.total_subsidy_lost ?? 0;
  const hasImpact = totalSubsidyLost > 0;
  const cliffIncome = result.subsidy_cliff_income;
  const yearsWithLoss = details.filter((d) => d.subsidy_lost > 0);
  const yearsHittingCliff = details.filter((d) => d.hits_cliff);

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-h3 text-text-primary">
            ACA marketplace subsidy impact
          </h3>
          <Tooltip content="Roth conversions increase your income (MAGI), which can reduce your ACA premium tax credit. This section shows how the recommended conversions affect your health insurance subsidy." />
        </div>
        <InfoTrigger
          label="How do conversions affect subsidies?"
          sectionId="conversion-tradeoff"
          triggerId="aca-subsidy"
        />
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-tight sm:gap-default">
        <MetricCard
          label="Subsidy preserved"
          value={
            hasImpact
              ? formatCurrency(
                  details.reduce((s, d) => s + d.subsidy_with_conversion, 0)
                )
              : "Full subsidy"
          }
          delta={hasImpact ? "after conversions" : "no impact from conversions"}
          deltaType={hasImpact ? "neutral" : "positive"}
        />
        <MetricCard
          label="Subsidy reduced by"
          value={formatCurrency(totalSubsidyLost)}
          delta={
            hasImpact
              ? `across ${yearsWithLoss.length} year${yearsWithLoss.length > 1 ? "s" : ""}`
              : undefined
          }
          deltaType={hasImpact ? "negative" : "neutral"}
        />
        <MetricCard
          label="True cost of conversions"
          value={formatCurrency(acaSummary.total_combined_cost)}
          delta="federal tax + subsidy loss"
          deltaType="neutral"
        />
        <MetricCard
          label="Effective combined rate"
          value={formatPercent(acaSummary.effective_combined_rate)}
          delta="tax + subsidy per dollar converted"
          deltaType="neutral"
          tooltip="The blended rate including both federal tax and ACA subsidy reduction per dollar converted."
        />
      </div>

      {/* Per-year breakdown table */}
      {hasImpact && (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="px-3 py-2.5 text-left font-medium">Year</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Income + conversion
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  % of poverty level
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Subsidy before
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Subsidy after
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Subsidy lost
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Combined rate
                </th>
              </tr>
            </thead>
            <tbody>
              {details.map((d) => (
                <tr
                  key={d.year}
                  className={`border-b border-border last:border-0 ${
                    d.hits_cliff ? "bg-negative/5" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-text-primary font-medium">
                    {d.year}
                    {d.hits_cliff && (
                      <span className="ml-1.5 text-[12px] text-negative font-medium">
                        CLIFF
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-text-primary"
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  >
                    {formatCurrency(d.magi_with_conversion)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right ${
                      d.income_pct_fpl > 400
                        ? "text-negative font-medium"
                        : d.income_pct_fpl > 350
                          ? "text-caution"
                          : "text-text-primary"
                    }`}
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  >
                    {Math.round(d.income_pct_fpl)}%
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-text-secondary"
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  >
                    {formatCurrency(d.subsidy_without_conversion)}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-text-primary"
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  >
                    {formatCurrency(d.subsidy_with_conversion)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-medium ${
                      d.subsidy_lost > 0 ? "text-negative" : "text-text-primary"
                    }`}
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  >
                    {d.subsidy_lost > 0 ? "-" : ""}
                    {formatCurrency(d.subsidy_lost)}
                  </td>
                  <td
                    className="px-3 py-2.5 text-right text-text-primary"
                    style={{ fontFamily: "'Manrope', system-ui" }}
                  >
                    {d.combined_marginal_rate > 0
                      ? formatPercent(d.combined_marginal_rate)
                      : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Explanation */}
      <p className="text-body-sm text-text-secondary">
        {acaSummary.explanation}
        {acaSummary.worst_year_note && (
          <>
            {" "}
            {acaSummary.worst_year_note}.
          </>
        )}
      </p>

      {/* Cliff warning */}
      {yearsHittingCliff.length > 0 && cliffIncome && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[4px] bg-negative/5 border border-negative/15">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-negative mt-0.5 flex-shrink-0"
          >
            <path
              d="M8 1.5l6.5 13H1.5L8 1.5z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M8 6v3.5M8 11.5v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="text-body-sm text-negative font-medium">
              Subsidy cliff warning
            </span>
            <span className="text-body-sm text-text-secondary">
              Income above {formatCurrency(cliffIncome)} (400% of the federal
              poverty level for your household) eliminates the ACA subsidy
              entirely. The optimizer limits conversions to stay below this
              threshold where beneficial.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
