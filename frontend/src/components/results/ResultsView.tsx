"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import { ChartLegend } from "@/components/common/ChartLegend";
import { BracketChart, Stat } from "@lucerna/ui";
import { formatCurrency, formatSavings } from "@/lib/utils/formatting";
import { CHART_COLORS, buildResultsDisclaimer } from "@/lib/utils/constants";
import { ConversionSlider } from "./ConversionSlider";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { AcaSubsidyImpact } from "./AcaSubsidyImpact";
import { Card } from "@/components/ui/card";
import { useConversionSlider } from "@/hooks/useConversionSlider";
import { useScrollOnTransition } from "@/hooks/useScrollOnTransition";
import { computeSnapThreshold } from "@/lib/utils/snap";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";
import { useTaxConfig } from "@/lib/tax/TaxConfigProvider";

interface ResultsViewProps {
  result: OptimizationResult;
  onReRun?: (input: ScenarioInput) => void;
  loading?: boolean;
}

export function ResultsView({ result }: ResultsViewProps) {
  // onReRun and loading are accepted for future calculator re-run support
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const taxConfig = useTaxConfig();
  const [tableColWidth, setTableColWidth] = useState(58);
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const handleSliderDragStart = useCallback(() => setIsSliderDragging(true), []);
  const handleSliderDragEnd = useCallback(() => setIsSliderDragging(false), []);

  // Client-side slider: continuous bracket fill computation
  const {
    totalConversion: sliderValue,
    setTotalConversion: setSliderValue,
    yearlyConversions,
    yearlyDetail,
    yearlyRmds,
    totalTaxCost,
    conversionYears,
    estimatedSavings,
  } = useConversionSlider({ result });

  // Auto-scroll bracket chart when a bar activates or deactivates.
  // Disabled during slider drag to prevent chart jumping while scrubbing.
  useScrollOnTransition(yearlyConversions, chartScrollRef, tableColWidth, !isSliderDragging);

  // Pre-compute the max gross amount (income + rmd + conversion) across ALL
  // curve points so BracketChart can use a stable Y-scale that does not jump
  // as the slider moves and individual year grosses cross bracket boundaries.
  // Each curve point carries its own yearly_rmd_amounts so the scale accounts
  // for the fact that higher conversions produce lower future RMDs.
  const stableMaxGrossAmount = useMemo(() => {
    const curve = result.conversion_curve ?? [];
    const optRmdMap = new Map<number, number>();
    for (const d of result.rmd_projection?.yearly_detail ?? []) {
      optRmdMap.set(d.year, d.rmd_amount);
    }
    let maxGross = 0;
    for (let i = 0; i < result.input.timeline.length; i++) {
      const yi = result.input.timeline[i];
      const optRmd = optRmdMap.get(yi.year) ?? 0;
      maxGross = Math.max(maxGross, yi.gross_income + optRmd + (result.yearly_conversions[i] ?? 0));
      for (const point of curve) {
        const curveRmd = (point.yearly_rmd_amounts ?? [])[i] ?? 0;
        maxGross = Math.max(
          maxGross,
          yi.gross_income + curveRmd + (point.yearly_conversions[i] ?? 0)
        );
      }
    }
    return maxGross;
  }, [result]);

  // Build chart data from client-side bracket fills
  const chartYears = useMemo(() => {
    return result.input.timeline.map((yi, i) => ({
      year: yi.year,
      age: result.input.age + i,
      rmdAmount: yearlyRmds[i] ?? 0,
      conversion: yearlyConversions[i],
      income: yi.gross_income,
    }));
  }, [result.input, yearlyRmds, yearlyConversions]);

  const snapThreshold = computeSnapThreshold(0, result.input.traditional_ira_balance);
  const isAtOptimal = Math.abs(sliderValue - result.total_conversion) <= snapThreshold;
  const savingsDifference = result.estimated_lifetime_tax_savings - estimatedSavings;

  return (
    <div className="flex flex-col gap-section">
      {/* The answer: savings at the chosen amount, what it takes, and how it fills each year */}
      <Card className="flex flex-col gap-comfortable" data-testid="results-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="-my-1 flex items-center gap-1">
              <span className="eyebrow">Estimated lifetime tax savings</span>
              <InfoTrigger
                label="How is this calculated?"
                sectionId="savings-number"
                triggerId="hero-savings"
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="metric-value-hero text-pine">{formatSavings(estimatedSavings)}</span>
              {!isAtOptimal && (
                <span className="font-data text-body-sm font-semibold text-negative">
                  &minus;{formatCurrency(Math.max(1, Math.abs(savingsDifference)))} vs. highest
                  savings
                </span>
              )}
            </div>
            <span className="text-caption text-text-tertiary">
              In today&apos;s dollars, compared with not converting
            </span>
          </div>
          <div className="w-full sm:w-[260px] sm:shrink-0">
            <ConversionSlider
              value={sliderValue}
              min={0}
              max={Math.max(result.input.traditional_ira_balance, result.total_conversion)}
              optimalValue={result.total_conversion}
              onChange={setSliderValue}
              onDragStart={handleSliderDragStart}
              onDragEnd={handleSliderDragEnd}
            />
          </div>
        </div>

        {/* The amount itself reads out on the slider. */}
        <div className="flex gap-10">
          <Stat label="Tax cost" value={formatCurrency(totalTaxCost)} />
          <Stat label="Years converting" value={String(conversionYears)} />
        </div>

        <BracketChart
          years={chartYears}
          brackets={taxConfig.brackets[result.input.filing_status]}
          standardDeduction={taxConfig.standard_deduction[result.input.filing_status]}
          addedTax={chartYears.map((_, i) => yearlyDetail[i]?.tax_cost)}
          scrollRef={chartScrollRef}
          onBarWidthChange={setTableColWidth}
          hideLegend
          stableMaxGrossAmount={stableMaxGrossAmount}
        />

        <div className="flex flex-col items-start gap-2 border-t border-border pt-default sm:flex-row sm:items-center sm:justify-between">
          <ChartLegend
            className="!justify-start"
            items={[
              { color: CHART_COLORS.income, label: "Other income" },
              ...(chartYears.some((y) => (y.rmdAmount ?? 0) > 0)
                ? [{ color: CHART_COLORS.rmd, label: "Required withdrawal" }]
                : []),
              { color: CHART_COLORS.conversion, label: "Roth conversion" },
              { color: "", label: "Room left in bracket", outline: true },
            ]}
          />
          <InfoTrigger
            label="How is this determined?"
            sectionId="bracket-filling"
            triggerId="bracket-chart"
            className="-ml-2.5 shrink-0 sm:ml-0"
            showLabel
          />
        </div>
      </Card>

      <ScenarioCards scenarios={result.scenarios} />

      {/* ACA subsidy impact (only when healthcare inputs provided) */}
      {result.aca_subsidy_impact && <AcaSubsidyImpact result={result} />}

      <BalanceProjections
        traditionalAtRetirement={result.traditional_at_retirement}
        rothAtRetirement={result.roth_at_retirement}
      />

      {/* Assumptions disclaimer */}
      <div className="flex flex-col items-start gap-2 border-t border-border pt-section text-body-sm text-text-tertiary">
        <p>
          {buildResultsDisclaimer({
            hasStateTax: !!result.input.state && result.input.state !== "none",
            acaSentence: result.aca_subsidy_impact
              ? "ACA marketplace subsidy impact is included based on your healthcare inputs."
              : "",
          })}
        </p>
        <InfoTrigger
          label="Are these reasonable?"
          sectionId="assumptions-limitations"
          triggerId="assumptions"
          className="-ml-2.5"
          showLabel
        />
      </div>
    </div>
  );
}
