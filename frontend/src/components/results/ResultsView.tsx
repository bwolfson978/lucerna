"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import type {
  OptimizationResult,
  ScenarioInput,
} from "@/lib/types";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { GlowButton } from "@/components/common/GlowButton";
import { formatCurrency, formatSavings } from "@/lib/utils/formatting";
import { BracketChart } from "./BracketChart";
import { ConversionSlider } from "./ConversionSlider";
import { TransposedDetailTable } from "./TransposedDetailTable";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { AcaSubsidyImpact } from "./AcaSubsidyImpact";
import { Card } from "@/components/ui/card";
import { useConversionSlider } from "@/hooks/useConversionSlider";
import { computeSnapThreshold } from "@/lib/utils/snap";
import { useSyncedScroll } from "@/hooks/useSyncedScroll";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";

interface YearOverride {
  income?: number;
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

  // Synced horizontal scroll between chart and detail table
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableColWidth, setTableColWidth] = useState(58);
  const [chartLayout, setChartLayout] = useState({ leftOffset: 88, rightOffset: 108 });
  useSyncedScroll(chartScrollRef, tableScrollRef);

  // Client-side slider: continuous bracket fill computation
  const {
    totalConversion: sliderValue,
    setTotalConversion: setSliderValue,
    yearlyBracketFills,
    yearlyDetail,
    displayTotalConversion,
    totalTaxCost,
    conversionYears,
    estimatedSavings,
  } = useConversionSlider({ result });

  // Build chart data from client-side bracket fills
  const chartYears = useMemo(() => {
    return result.input.income_timeline.map((yi, i) => ({
      year: yi.year,
      age: result.input.age + i,
      bracketFill: yearlyBracketFills[i] || [],
    }));
  }, [result.input, yearlyBracketFills]);

  // Income arrays for the detail table
  const incomes = result.input.income_timeline.map((yi) => yi.gross_income);
  const yearInfos = result.input.income_timeline.map((yi, i) => ({
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

  const handleReRun = useCallback(() => {
    if (!onReRun) return;
    const updatedTrajectory = result.input.income_timeline.map((yi, i) => {
      const override = overrides.get(i);
      return {
        ...yi,
        gross_income: override?.income ?? yi.gross_income,
      };
    });
    const updatedInput: ScenarioInput = {
      ...result.input,
      income_timeline: updatedTrajectory,
    };
    setOverrides(new Map());
    onReRun(updatedInput);
  }, [result.input, overrides, onReRun]);

  const snapThreshold = computeSnapThreshold(0, result.input.traditional_ira_balance);
  const isAtOptimal =
    Math.abs(sliderValue - result.total_conversion) <= snapThreshold;
  const savingsDifference =
    result.estimated_lifetime_tax_savings - estimatedSavings;

  return (
    <div className="flex flex-col gap-section">
      {/* Hero metric + slider */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-default">
        {/* Headline metric */}
        <Card recommended className="p-section">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="metric-label">
                Estimated lifetime tax savings
              </span>
              <InfoTrigger
                label="How is this calculated?"
                sectionId="savings-number"
                triggerId="hero-savings"
              />
            </div>
            <span className="metric-value-hero text-optimal">
              {formatSavings(estimatedSavings)}
            </span>
            {!isAtOptimal && (
              <span
                className="flex items-center gap-1 text-body-sm text-negative font-medium"
                style={{ fontFamily: "'Manrope', system-ui" }}
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
            max={Math.max(result.input.traditional_ira_balance, result.total_conversion)}
            optimalValue={result.total_conversion}
            onChange={setSliderValue}
          />
        </Card>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-tight sm:gap-default">
        <MetricCard
          label="Total Roth conversion"
          value={formatCurrency(displayTotalConversion)}
        />
        <MetricCard
          label="Tax on Roth conversions"
          value={formatCurrency(totalTaxCost)}
        />
        <MetricCard
          label="Conversion years"
          value={String(conversionYears)}
        />
      </div>

      {/* Bracket chart + detail table — same Card so scroll areas align */}
      <Card className="flex flex-col gap-default">
        <div className="flex items-center justify-end px-4 pt-2 -mb-2">
          <InfoTrigger
            label="Why these brackets?"
            sectionId="bracket-filling"
            triggerId="bracket-chart"
          />
        </div>
        <BracketChart
          years={chartYears}
          filingStatus={result.input.filing_status}
          scrollRef={chartScrollRef}
          onBarWidthChange={setTableColWidth}
          onLayoutChange={setChartLayout}
        />

        {/* Separator between chart and table */}
        <div className="border-t border-border" />

        <div className="flex items-center justify-between">
          {onReRun && (
            <p className="text-body-sm text-text-tertiary">
              Adjust income or life events below, then re-run the analysis.
            </p>
          )}
          {result.input.income_timeline.length > 1 && (
            <InfoTrigger
              label="How is this allocated across years?"
              sectionId="multi-year-allocation"
              triggerId="detail-table"
              className="shrink-0"
            />
          )}
        </div>
        <TransposedDetailTable
          details={yearlyDetail}
          years={yearInfos}
          incomes={incomes}
          overrides={overrides}
          onIncomeChange={handleIncomeChange}
          scrollRef={tableScrollRef}
          colWidth={tableColWidth}
          leftOffset={chartLayout.leftOffset}
          rightOffset={chartLayout.rightOffset}
        />

        {/* Re-run button */}
        {hasUnsavedChanges && onReRun && (
          <div className="pt-3 border-t border-border flex items-center justify-between">
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
        <div className="flex items-start justify-between gap-4">
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
          <InfoTrigger
            label="Are these reasonable?"
            sectionId="assumptions-limitations"
            triggerId="assumptions"
            className="shrink-0"
          />
        </div>
      </div>

    </div>
  );
}
