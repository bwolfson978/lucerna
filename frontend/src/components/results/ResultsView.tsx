"use client";

import { useState } from "react";
import type { OptimizationResult } from "@/lib/types";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { BracketFillChart } from "./BracketFillChart";
import { TrajectoryChart } from "./TrajectoryChart";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { YearlyDetailTable } from "./YearlyDetailTable";

interface ResultsViewProps {
  result: OptimizationResult;
}

export function ResultsView({ result }: ResultsViewProps) {
  const [selectedYearIndex, setSelectedYearIndex] = useState(0);

  const selectedYear = result.input.income_trajectory[selectedYearIndex];
  const selectedBracketFill =
    result.yearly_bracket_fill[selectedYearIndex] || [];

  return (
    <div className="flex flex-col gap-section">
      {/* Headline metric */}
      <div className="card-recommended p-section">
        <span className="absolute -top-3 left-4 bg-accent-light text-accent-hover text-[11px] font-medium px-2.5 py-0.5 rounded-md">
          Optimal strategy
        </span>
        <div className="flex flex-col gap-2">
          <span className="metric-label">Estimated lifetime tax savings</span>
          <span className="metric-value-hero">
            {formatCurrency(result.estimated_lifetime_tax_savings)}
          </span>
          <span className="text-body-sm text-text-secondary">
            vs. not converting — in today&apos;s dollars
            <Tooltip content="This is the difference in after-tax wealth between the optimal conversion schedule and doing nothing, expressed in today's dollars using your discount rate." />
          </span>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-default">
        <MetricCard
          label="Total conversion"
          value={formatCurrency(result.total_conversion)}
        />
        <MetricCard
          label="Tax on conversions"
          value={formatCurrency(result.total_tax_on_conversions)}
        />
        <MetricCard
          label="Effective rate"
          value={formatPercent(result.overall_effective_rate)}
        />
        <MetricCard
          label="Conversion years"
          value={String(result.yearly_conversions.filter((c) => c > 0).length)}
        />
      </div>

      {/* Trajectory chart */}
      <TrajectoryChart
        data={result.trajectory_chart}
        onYearClick={setSelectedYearIndex}
      />

      {/* Bracket fill for selected year */}
      <BracketFillChart
        data={selectedBracketFill}
        year={selectedYear?.year}
      />

      {/* Scenario comparison */}
      <ScenarioCards scenarios={result.scenarios} />

      {/* Balance projections */}
      <BalanceProjections
        traditionalAtRetirement={result.traditional_at_retirement}
        rothAtRetirement={result.roth_at_retirement}
        npvAtOptimal={result.npv_at_optimal}
        npvAtZero={result.npv_at_zero}
      />

      {/* Year-by-year detail */}
      <YearlyDetailTable details={result.yearly_detail} />

      {/* Assumptions disclaimer */}
      <div className="text-body-sm text-text-tertiary border-t border-border pt-section">
        <p>
          This analysis uses federal tax brackets only (2025 rates). State
          taxes, ACA subsidies, Social Security taxation, and RMDs are not
          modeled. The model assumes all remaining balances are withdrawn at
          the end of the retirement period. This is educational scenario
          analysis, not financial advice.
        </p>
      </div>
    </div>
  );
}
