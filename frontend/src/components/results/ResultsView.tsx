"use client";

import { useMemo, useRef, useState } from "react";
import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import { MetricCard } from "@/components/common/MetricCard";
import { Tooltip } from "@/components/common/Tooltip";
import { ChartLegend } from "@/components/common/ChartLegend";
import { formatCurrency, formatSavings, formatTableCurrency } from "@/lib/utils/formatting";
import { CHART_COLORS } from "@/lib/utils/constants";
import { dataFontStyle } from "@/lib/utils/constants";
import { BracketChart } from "./BracketChart";
import { ConversionSlider } from "./ConversionSlider";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { AcaSubsidyImpact } from "./AcaSubsidyImpact";
import { RmdImpactChart } from "./RmdImpactChart";
import { Card } from "@/components/ui/card";
import { useConversionSlider } from "@/hooks/useConversionSlider";
import { useScrollOnTransition } from "@/hooks/useScrollOnTransition";
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
  const [chartLayout, setChartLayout] = useState({
    leftOffset: 0,
    rightOffset: 0,
    verticalLabelWidth: 0,
    axisLabelStart: 0,
  });

  // Client-side slider: continuous bracket fill computation
  const {
    totalConversion: sliderValue,
    setTotalConversion: setSliderValue,
    yearlyConversions,
    yearlyBracketFills,
    yearlyDetail,
    displayTotalConversion,
    totalTaxCost,
    conversionYears,
    estimatedSavings,
  } = useConversionSlider({ result });

  // Auto-scroll bracket chart when a bar activates or deactivates
  useScrollOnTransition(yearlyConversions, chartScrollRef, tableColWidth);

  // RMD amounts keyed by year, for income bar segmentation
  const rmdByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of result.rmd_projection?.yearly_detail ?? []) {
      map.set(d.year, d.rmd_amount);
    }
    return map;
  }, [result.rmd_projection]);

  // Build chart data from client-side bracket fills
  const chartYears = useMemo(() => {
    return result.input.timeline.map((yi, i) => ({
      year: yi.year,
      age: result.input.age + i,
      bracketFill: yearlyBracketFills[i] || [],
      rmdAmount: rmdByYear.get(yi.year),
    }));
  }, [result.input, yearlyBracketFills, rmdByYear]);

  const yearInfos = result.input.timeline.map((yi, i) => ({
    year: yi.year,
    age: result.input.age + i,
  }));

  const snapThreshold = computeSnapThreshold(0, result.input.traditional_ira_balance);
  const isAtOptimal = Math.abs(sliderValue - result.total_conversion) <= snapThreshold;
  const savingsDifference = result.estimated_lifetime_tax_savings - estimatedSavings;

  return (
    <div className="flex flex-col gap-section">
      {/* Summary metrics */}
      <div className="grid grid-cols-1 gap-tight sm:grid-cols-3 sm:gap-default">
        <MetricCard label="Total Roth conversion" value={formatCurrency(displayTotalConversion)} />
        <MetricCard label="Tax on Roth conversions" value={formatCurrency(totalTaxCost)} />
        <MetricCard label="Conversion years" value={String(conversionYears)} />
      </div>

      {/* Bracket chart with slider + annotation row */}
      <div className="flex flex-col gap-default">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-h3 text-text-primary">Roth conversion schedule</h3>
          <InfoTrigger
            label="How is this determined?"
            sectionId="bracket-filling"
            triggerId="bracket-chart"
            className="shrink-0"
          />
        </div>
        <Card className="flex flex-col gap-default">
          {/* Top row: compact hero metric (left) + slider (right, max 1/3) */}
          {/* Aligned with chart axes: left edge matches income labels, right edge matches bar area */}
          <div
            className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
            style={{
              paddingLeft: chartLayout.axisLabelStart,
              paddingRight: chartLayout.rightOffset,
            }}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="metric-label">Estimated lifetime tax savings</span>
                <InfoTrigger
                  label="How is this calculated?"
                  sectionId="savings-number"
                  triggerId="hero-savings"
                />
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="metric-value-hero text-optimal">
                  {formatSavings(estimatedSavings)}
                </span>
                {!isAtOptimal && (
                  <span
                    className="flex items-center gap-1 whitespace-nowrap text-body-sm font-medium text-negative"
                    style={dataFontStyle}
                  >
                    {formatCurrency(Math.max(1, Math.abs(savingsDifference)))} less than highest
                    savings
                  </span>
                )}
              </div>
              <span className="text-body-sm text-text-secondary">
                vs. not converting, in today&apos;s dollars
                <Tooltip content="This is the difference in after-tax wealth between the selected conversion schedule and doing nothing, expressed in today's dollars using your discount rate." />
              </span>
            </div>
            <div className="w-full sm:w-1/3 sm:min-w-[180px] sm:flex-shrink-0">
              <ConversionSlider
                value={sliderValue}
                min={0}
                max={Math.max(result.input.traditional_ira_balance, result.total_conversion)}
                optimalValue={result.total_conversion}
                onChange={setSliderValue}
              />
            </div>
          </div>
          <BracketChart
            years={chartYears}
            filingStatus={result.input.filing_status}
            scrollRef={chartScrollRef}
            onBarWidthChange={setTableColWidth}
            onLayoutChange={setChartLayout}
            hideLegend
            leftBottomContent={
              <div className="flex flex-col border-r border-border">
                <div className="flex h-8 items-center justify-end px-1 text-right text-data-xs font-medium leading-tight text-text-tertiary">
                  Added tax from conversion
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
                    className="flex h-8 items-center justify-center px-1 text-data-xs text-text-primary"
                    style={{
                      width: `${colWidth}px`,
                      minWidth: `${colWidth}px`,
                      ...dataFontStyle,
                    }}
                  >
                    {detail ? formatTableCurrency(detail.tax_cost, maxChars) : "-"}
                  </div>
                );
              })}
            </div>
          </BracketChart>

          {/* Series legend */}
          <ChartLegend
            items={[
              { color: CHART_COLORS.income, label: "Other income" },
              ...(chartYears.some((y) => (y.rmdAmount ?? 0) > 0)
                ? [{ color: CHART_COLORS.rmd, label: "Required withdrawal" }]
                : []),
              { color: CHART_COLORS.conversion, label: "Roth Conversion" },
              { color: "", label: "Remaining space in tax bracket", outline: true },
            ]}
          />
        </Card>
      </div>

      {/* Scenario comparison */}
      <ScenarioCards scenarios={result.scenarios} />

      {/* ACA subsidy impact (only when healthcare inputs provided) */}
      {result.aca_subsidy_impact && <AcaSubsidyImpact result={result} />}

      {/* RMD impact (shown when RMD projection data is available) */}
      {result.rmd_projection &&
        result.rmd_projection_no_conversion &&
        result.rmd_projection.yearly_detail.length > 0 && <RmdImpactChart result={result} />}

      {/* Balance projections */}
      <BalanceProjections
        traditionalAtRetirement={result.traditional_at_retirement}
        rothAtRetirement={result.roth_at_retirement}
        npvAtOptimal={result.npv_at_optimal}
        npvAtZero={result.npv_at_zero}
      />

      {/* Assumptions disclaimer */}
      <div className="border-t border-border pt-section text-body-sm text-text-tertiary">
        <div className="flex items-start justify-between gap-4">
          <p>
            This analysis uses 2026 federal
            {result.input.state && result.input.state !== "none" ? " and state" : ""} tax brackets,
            and models required minimum distributions in the retirement phase.
            {result.aca_subsidy_impact
              ? " ACA marketplace subsidy impact is included based on your healthcare inputs."
              : ""}{" "}
            Social Security benefits and IRMAA surcharges are not included. This is educational
            scenario analysis, not financial advice.
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
