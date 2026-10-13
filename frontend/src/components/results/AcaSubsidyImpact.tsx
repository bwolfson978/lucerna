"use client";

import type { OptimizationResult } from "@/lib/types";
import { Stat } from "@lucerna/ui";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { dataFontStyle } from "@/lib/utils/constants";
import { Card } from "@/components/ui/card";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";
import { cn } from "@/lib/utils";

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
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-text-primary">ACA marketplace subsidy impact</h3>
        <InfoTrigger
          label="How do conversions affect subsidies?"
          sectionId="conversion-tradeoff"
          triggerId="aca-subsidy"
          className="shrink-0"
        />
      </div>

      {/* Summary metrics: with no subsidy lost, two numbers say it all. */}
      <Card
        className={cn(
          "grid grid-cols-2 gap-x-3 gap-y-5",
          hasImpact ? "sm:grid-cols-4" : "sm:grid-cols-3"
        )}
      >
        {hasImpact ? (
          <>
            <Stat
              label="Subsidy kept"
              value={formatCurrency(details.reduce((s, d) => s + d.subsidy_with_conversion, 0))}
              note="after conversions"
            />
            <Stat
              label="Subsidy lost"
              value={formatCurrency(totalSubsidyLost)}
              tone="negative"
              note={`across ${yearsWithLoss.length} year${yearsWithLoss.length > 1 ? "s" : ""}`}
            />
          </>
        ) : (
          <Stat
            label="Subsidy"
            value="Fully kept"
            tone="positive"
            note="conversions don't reduce it"
          />
        )}
        <Stat
          label="True cost"
          value={formatCurrency(acaSummary.total_combined_cost)}
          note="federal tax + subsidy lost"
        />
        <Stat
          label="Combined rate"
          value={formatPercent(acaSummary.effective_combined_rate)}
          note="per dollar converted"
        />
      </Card>

      {/* Per-year breakdown table */}
      {hasImpact && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="px-3 py-2.5 text-left font-medium">Year</th>
                <th className="px-3 py-2.5 text-right font-medium">Income + conversion</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  % of poverty level
                </th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                  Subsidy before
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Subsidy after</th>
                <th className="px-3 py-2.5 text-right font-medium">Subsidy lost</th>
                <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
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
                  <td className="px-3 py-2.5 font-medium text-text-primary">
                    {d.year}
                    {d.hits_cliff && (
                      <span className="ml-1.5 text-[12px] font-medium text-negative">CLIFF</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-primary" style={dataFontStyle}>
                    {formatCurrency(d.magi_with_conversion)}
                  </td>
                  <td
                    className={`hidden px-3 py-2.5 text-right sm:table-cell ${
                      d.income_pct_fpl > 400
                        ? "font-medium text-negative"
                        : d.income_pct_fpl > 350
                          ? "text-caution"
                          : "text-text-primary"
                    }`}
                    style={dataFontStyle}
                  >
                    {Math.round(d.income_pct_fpl)}%
                  </td>
                  <td
                    className="hidden px-3 py-2.5 text-right text-text-secondary sm:table-cell"
                    style={dataFontStyle}
                  >
                    {formatCurrency(d.subsidy_without_conversion)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-primary" style={dataFontStyle}>
                    {formatCurrency(d.subsidy_with_conversion)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-medium ${
                      d.subsidy_lost > 0 ? "text-negative" : "text-text-primary"
                    }`}
                    style={dataFontStyle}
                  >
                    {d.subsidy_lost > 0 ? "-" : ""}
                    {formatCurrency(d.subsidy_lost)}
                  </td>
                  <td
                    className="hidden px-3 py-2.5 text-right text-text-primary sm:table-cell"
                    style={dataFontStyle}
                  >
                    {d.combined_marginal_rate > 0 ? formatPercent(d.combined_marginal_rate) : "--"}
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
        {acaSummary.worst_year_note && <> {acaSummary.worst_year_note}.</>}
      </p>

      {/* Cliff warning */}
      {yearsHittingCliff.length > 0 && cliffIncome && (
        <div className="flex items-start gap-2.5 rounded-[14px] border border-negative/15 bg-negative/5 px-4 py-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="mt-0.5 flex-shrink-0 text-negative"
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
            <span className="text-body-sm font-medium text-negative">Subsidy cliff warning</span>
            <span className="text-body-sm text-text-secondary">
              Income above {formatCurrency(cliffIncome)} (400% of the federal poverty level for your
              household) eliminates the ACA subsidy entirely. The optimizer limits conversions to
              stay below this threshold where beneficial.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
