"use client";

import { useMemo, useRef, useState } from "react";
import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { formatCurrency, formatSavings, formatTableCurrency } from "@/lib/utils/formatting";
import { BracketChart } from "./BracketChart";
import { ConversionSlider } from "./ConversionSlider";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { AcaSubsidyImpact } from "./AcaSubsidyImpact";
import { Card } from "@/components/ui/card";
import { useConversionSlider } from "@/hooks/useConversionSlider";
import { computeSnapThreshold } from "@/lib/utils/snap";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";

interface ResultsViewProps {
  result: OptimizationResult;
  onReRun?: (input: ScenarioInput) => void;
  loading?: boolean;
}

export function ResultsView({ result }: ResultsViewProps) {
  // onReRun and loading are accepted for future calculator re-run support
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [tableColWidth, setTableColWidth] = useState(58);

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

  const yearInfos = result.input.income_timeline.map((yi, i) => ({
    year: yi.year,
    age: result.input.age + i,
  }));

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
              vs. not converting, in today&apos;s dollars
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

      {/* Bracket chart with annotation row in a single scroll container */}
      <div className="flex flex-col gap-default">
        <div className="flex items-center justify-between">
          <h3 className="text-h3 text-text-primary">Conversion schedule</h3>
          <InfoTrigger
            label="How is this determined?"
            sectionId="bracket-filling"
            triggerId="bracket-chart"
          />
        </div>
        <Card className="flex flex-col gap-default">
        <BracketChart
          years={chartYears}
          filingStatus={result.input.filing_status}
          scrollRef={chartScrollRef}
          onBarWidthChange={setTableColWidth}
          leftBottomContent={
            <div className="flex flex-col border-r border-border">
              <div className="h-8 flex items-center justify-end text-text-tertiary text-data-xs font-medium px-2 whitespace-nowrap">
                Additional tax due to conversion
              </div>
            </div>
          }
        >
          {/* Annotation row: tax cost per year */}
          <div className="flex">
            {yearInfos.map((yearInfo, i) => {
              const detail = yearlyDetail[i];
              const colWidth = tableColWidth;
              const maxChars = Math.max(4, Math.floor((colWidth - 8) / 6.5));
              return (
                <div
                  key={yearInfo.year}
                  className="flex items-center justify-center h-8 text-data-xs text-text-primary px-1"
                  style={{
                    width: `${colWidth}px`,
                    minWidth: `${colWidth}px`,
                    fontFamily: "'Manrope', system-ui",
                  }}
                >
                  {detail ? formatTableCurrency(detail.tax_cost, maxChars) : "-"}
                </div>
              );
            })}
          </div>
        </BracketChart>

      </Card>
      </div>

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
            This analysis uses 2025 federal tax brackets
            {result.input.state && result.input.state !== "none"
              ? " and state income tax"
              : ""}
            , and models required minimum distributions in the retirement
            phase.
            {result.aca_subsidy_impact
              ? " ACA marketplace subsidy impact is included based on your healthcare inputs."
              : ""}{" "}
            Social Security benefits and IRMAA surcharges are not included.
            This is educational scenario analysis, not financial advice.
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
