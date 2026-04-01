"use client";

import { useState, useMemo, useCallback } from "react";
import type {
  OptimizationResult,
  LifeEvent,
  ScenarioInput,
} from "@/lib/types";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { GlowButton } from "@/components/common/GlowButton";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { BracketChart } from "./BracketChart";
import { ConversionSlider } from "./ConversionSlider";
import { TransposedDetailTable } from "./TransposedDetailTable";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { AcaSubsidyImpact } from "./AcaSubsidyImpact";
import { Card } from "@/components/ui/card";
import { useConversionSlider } from "@/hooks/useConversionSlider";

interface YearOverride {
  income?: number;
  life_event?: LifeEvent;
}

interface ResultsViewProps {
  result: OptimizationResult;
  onReRun?: (input: ScenarioInput) => void;
  loading?: boolean;
}

export function ResultsView({ result, onReRun, loading }: ResultsViewProps) {
  const [overrides, setOverrides] = useState<Map<number, YearOverride>>(
    () => new Map()
  );

  const hasUnsavedChanges = overrides.size > 0;

  // Client-side slider: continuous bracket fill computation
  const {
    totalConversion: sliderValue,
    setTotalConversion: setSliderValue,
    yearlyBracketFills,
    yearlyDetail,
    displayTotalConversion,
    totalTaxCost,
    effectiveRate,
    conversionYears,
    estimatedSavings,
  } = useConversionSlider({ result });

  // Build chart data from client-side bracket fills
  const chartYears = useMemo(() => {
    return result.input.income_trajectory.map((yi, i) => ({
      year: yi.year,
      age: result.input.age + i,
      bracketFill: yearlyBracketFills[i] || [],
    }));
  }, [result.input, yearlyBracketFills]);

  // Income and life event arrays for the detail table
  const incomes = result.input.income_trajectory.map((yi) => yi.gross_income);
  const lifeEvents = result.input.income_trajectory.map(
    (yi) => yi.life_event
  );
  const yearInfos = result.input.income_trajectory.map((yi, i) => ({
    year: yi.year,
    age: result.input.age + i,
  }));

  const handleIncomeChange = useCallback(
    (yearIndex: number, income: number) => {
      setOverrides((prev) => {
        const next = new Map(prev);
        const existing = next.get(yearIndex) || {};
        next.set(yearIndex, { ...existing, income });
        return next;
      });
    },
    []
  );

  const handleLifeEventChange = useCallback(
    (yearIndex: number, life_event: LifeEvent) => {
      setOverrides((prev) => {
        const next = new Map(prev);
        const existing = next.get(yearIndex) || {};
        next.set(yearIndex, { ...existing, life_event });
        return next;
      });
    },
    []
  );

  const handleReRun = useCallback(() => {
    if (!onReRun) return;
    const updatedTrajectory = result.input.income_trajectory.map((yi, i) => {
      const override = overrides.get(i);
      return {
        ...yi,
        gross_income: override?.income ?? yi.gross_income,
        life_event: override?.life_event ?? yi.life_event,
      };
    });
    const updatedInput: ScenarioInput = {
      ...result.input,
      income_trajectory: updatedTrajectory,
    };
    setOverrides(new Map());
    onReRun(updatedInput);
  }, [result.input, overrides, onReRun]);

  const isAtOptimal =
    Math.abs(sliderValue - result.total_conversion) < 100;
  const savingsDifference =
    result.estimated_lifetime_tax_savings - estimatedSavings;

  return (
    <div className="flex flex-col gap-section">
      {/* Hero metric + slider */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-default">
        {/* Headline metric */}
        <Card recommended className="p-section">
          <div className="flex flex-col gap-2">
            <span className="metric-label">
              Estimated lifetime tax savings
            </span>
            <span className="metric-value-hero">
              {formatCurrency(estimatedSavings)}
            </span>
            {!isAtOptimal && (
              <span
                className="flex items-center gap-1 text-body-sm text-negative font-medium"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 2v8M6 10l-3-3M6 10l3-3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {formatCurrency(Math.max(1, Math.abs(savingsDifference)))} less than highest savings
              </span>
            )}
            <span className="text-body-sm text-text-secondary">
              vs. not converting — in today&apos;s dollars
              <Tooltip content="This is the difference in after-tax wealth between the selected conversion schedule and doing nothing, expressed in today's dollars using your discount rate." />
            </span>
          </div>
        </Card>

        {/* Slider */}
        <Card className="p-section flex flex-col justify-center">
          <ConversionSlider
            value={sliderValue}
            min={0}
            max={result.input.traditional_ira_balance}
            optimalValue={result.total_conversion}
            onChange={setSliderValue}
          />
        </Card>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-default">
        <MetricCard
          label="Total conversion"
          value={formatCurrency(displayTotalConversion)}
        />
        <MetricCard
          label="Tax on conversions"
          value={formatCurrency(totalTaxCost)}
        />
        <MetricCard
          label="Effective rate"
          value={formatPercent(effectiveRate)}
          tooltip="The average tax rate on your total conversion amount — total tax paid divided by total converted."
        />
        <MetricCard
          label="Conversion years"
          value={String(conversionYears)}
        />
      </div>

      {/* Bracket chart */}
      <BracketChart
        years={chartYears}
        filingStatus={result.input.filing_status}
      />

      {/* Transposed detail table */}
      {onReRun && (
        <p className="text-body-sm text-text-tertiary">
          Adjust income or life events below, then re-run the analysis.
        </p>
      )}
      <Card className="p-0">
        <TransposedDetailTable
          details={yearlyDetail}
          years={yearInfos}
          incomes={incomes}
          lifeEvents={lifeEvents}
          overrides={overrides}
          onIncomeChange={handleIncomeChange}
          onLifeEventChange={handleLifeEventChange}
        />

        {/* Re-run button */}
        {hasUnsavedChanges && onReRun && (
          <div className="p-3 border-t border-border flex items-center justify-between bg-accent/5">
            <span className="text-body-sm text-text-secondary">
              Income values modified
            </span>
            <GlowButton onClick={handleReRun} loading={loading}>
              Re-run analysis
            </GlowButton>
          </div>
        )}
      </Card>

      {/* Scenario comparison */}
      <ScenarioCards scenarios={result.scenarios} />

      {/* ACA subsidy impact (only when healthcare inputs provided) */}
      {result.aca_subsidy_impact && (
        <AcaSubsidyImpact result={result} />
      )}

      {/* Balance projections */}
      <BalanceProjections
        traditionalAtRetirement={result.traditional_at_retirement}
        rothAtRetirement={result.roth_at_retirement}
        npvAtOptimal={result.npv_at_optimal}
        npvAtZero={result.npv_at_zero}
      />

      {/* Assumptions disclaimer */}
      <div className="text-body-sm text-text-tertiary border-t border-border pt-section">
        <p>
          This analysis uses federal tax brackets only (2025 rates).
          {result.aca_subsidy_impact
            ? " ACA marketplace subsidy impact is included based on your healthcare inputs (2026 rules, 2025 FPL guidelines)."
            : " ACA subsidies are not modeled — enable the marketplace toggle to include them."}{" "}
          State taxes, Social Security taxation, and RMDs are not modeled.
          The model assumes all remaining balances are withdrawn at the end
          of the retirement period. This is educational scenario analysis,
          not financial advice.
        </p>
      </div>
    </div>
  );
}
