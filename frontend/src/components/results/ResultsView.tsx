"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { OptimizationResult, ScenarioInput } from "@/lib/types";
import { ChartLegend } from "@/components/common/ChartLegend";
import {
  BracketChart,
  ConversionSlider,
  MostSavingsNote,
  Stat,
  useResultSlider,
} from "@lucerna/ui";
import { resultCardData, resultDetails } from "@/lib/results/viewData";
import { formatCurrency, formatSavings } from "@/lib/utils/formatting";
import { CHART_COLORS, buildResultsDisclaimer } from "@/lib/utils/constants";
import { ScenarioCards } from "./ScenarioCards";
import { BalanceProjections } from "./BalanceProjections";
import { AcaSubsidyImpact } from "./AcaSubsidyImpact";
import { Card } from "@/components/ui/card";
import { useScrollOnTransition } from "@/hooks/useScrollOnTransition";
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
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  const handleSliderDragStart = useCallback(() => setIsSliderDragging(true), []);
  const handleSliderDragEnd = useCallback(() => setIsSliderDragging(false), []);

  // The slider and every number at its total come from the same shared code and data as
  // the result card in the conversation (useResultSlider), so the two always agree.
  const data = useMemo(() => resultCardData("full-results", result), [result]);
  const details = useMemo(() => resultDetails(result), [result]);
  const {
    total: sliderValue,
    move: setSliderValue,
    optimal,
    max: sliderMax,
    curve,
    stableMax: stableMaxGrossAmount,
    atOptimal: isAtOptimal,
    savings: estimatedSavings,
    shortfall,
    taxCost: totalTaxCost,
    years: conversionYears,
    chart,
  } = useResultSlider(data, details);
  const fill = chart ?? details.bracket_fill!;

  const chartYears = useMemo(
    () =>
      fill.years.map((y) => ({
        year: y.year,
        age: y.age,
        rmdAmount: y.rmd,
        conversion: y.conversion,
        income: y.income,
      })),
    [fill]
  );
  const yearlyConversions = useMemo(() => fill.years.map((y) => y.conversion), [fill]);

  // Auto-scroll bracket chart when a bar activates or deactivates.
  // Disabled during slider drag to prevent chart jumping while scrubbing.
  useScrollOnTransition(yearlyConversions, chartScrollRef, tableColWidth, !isSliderDragging);

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
            <div className="flex flex-col gap-1">
              <span className="metric-value-hero text-pine">{formatSavings(estimatedSavings)}</span>
              {/* Room for the note's two lines on a phone, so nothing moves while the
                  slider runs. */}
              <div className="min-h-[50px] sm:min-h-0">
                <MostSavingsNote
                  atOptimal={isAtOptimal}
                  shortfall={shortfall}
                  onBack={() => setSliderValue(optimal)}
                />
              </div>
            </div>
            <span className="text-caption text-text-tertiary">
              In today&apos;s dollars, compared with not converting
            </span>
          </div>
          {curve && (
            <div className="w-full sm:w-[260px] sm:shrink-0">
              <ConversionSlider
                value={sliderValue}
                max={sliderMax}
                optimalValue={optimal}
                onChange={setSliderValue}
                onDragStart={handleSliderDragStart}
                onDragEnd={handleSliderDragEnd}
                savings={curve.points}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 sm:flex sm:gap-10">
          <Stat label="Converted" value={formatCurrency(sliderValue)} />
          <Stat label="Tax cost" value={formatCurrency(totalTaxCost)} />
          <Stat label="Years" value={String(conversionYears)} />
        </div>

        <BracketChart
          years={chartYears}
          brackets={fill.brackets}
          standardDeduction={fill.standard_deduction}
          addedTax={fill.years.map((y) => y.tax)}
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
