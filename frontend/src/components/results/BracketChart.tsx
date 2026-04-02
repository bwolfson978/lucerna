"use client";

import type { BracketFillResult } from "@/lib/types";
import { formatPercent } from "@/lib/utils/formatting";
import { BRACKET_COLORS, CHART_COLORS } from "@/lib/utils/constants";
import { useRef, useMemo } from "react";
import { Card } from "@/components/ui/card";

interface YearData {
  year: number;
  age: number;
  bracketFill: BracketFillResult[];
}

interface BracketChartProps {
  years: YearData[];
  filingStatus: "single" | "married_filing_jointly";
}

// All bracket boundaries for axis labels
const BRACKET_BOUNDARIES: Record<string, { rate: number; max: number }[]> = {
  single: [
    { rate: 0.10, max: 11925 },
    { rate: 0.12, max: 48475 },
    { rate: 0.22, max: 103350 },
    { rate: 0.24, max: 197300 },
    { rate: 0.32, max: 250525 },
    { rate: 0.35, max: 626350 },
  ],
  married_filing_jointly: [
    { rate: 0.10, max: 23850 },
    { rate: 0.12, max: 96950 },
    { rate: 0.22, max: 206700 },
    { rate: 0.24, max: 394600 },
    { rate: 0.32, max: 501050 },
    { rate: 0.35, max: 751600 },
  ],
};

const BAR_WIDTH = 48;
const BAR_GAP = 10;
const CHART_HEIGHT = 320;
const TOP_PADDING = 16;
const BOTTOM_PADDING = 40;

/** Pick a nice round interval for evenly spaced tick marks. */
function niceInterval(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / magnitude;
  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3) nice = 2;
  else if (residual <= 7) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

export function BracketChart({ years, filingStatus }: BracketChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const brackets = BRACKET_BOUNDARIES[filingStatus];

  // Determine max Y value: highest bracket that any year reaches into, plus one
  const maxFilledBracketRate = useMemo(() => {
    let maxRate = 0.12; // Show at least through 12%
    for (const year of years) {
      for (const bf of year.bracketFill) {
        if (bf.filled_by_income + bf.filled_by_conversion > 0) {
          maxRate = Math.max(maxRate, bf.bracket_rate);
        }
      }
    }
    return maxRate;
  }, [years]);

  // Find the bracket boundary to use as chart max
  const maxBracket = useMemo(() => {
    const idx = brackets.findIndex((b) => b.rate >= maxFilledBracketRate);
    // Show one bracket above the highest filled one
    const showIdx = Math.min(idx + 1, brackets.length - 1);
    return brackets[showIdx];
  }, [brackets, maxFilledBracketRate]);

  const chartMax = maxBracket.max;
  const drawableHeight = CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING;

  // Scale: dollars to pixels (y goes downward in SVG, so we invert)
  const yScale = (dollars: number) => {
    const ratio = dollars / chartMax;
    return CHART_HEIGHT - BOTTOM_PADDING - ratio * drawableHeight;
  };

  // Evenly spaced income tick marks for left axis
  const incomeTicks = useMemo(() => {
    const interval = niceInterval(chartMax, 5);
    const ticks: number[] = [];
    for (let v = 0; v <= chartMax; v += interval) {
      ticks.push(v);
    }
    return ticks;
  }, [chartMax]);

  const totalBarWidth = years.length * (BAR_WIDTH + BAR_GAP);
  const leftLabelWidth = 70;
  const rightLabelWidth = 90;

  return (
    <Card className="flex flex-col gap-default">
      {/* Legend */}
      <div className="flex items-center gap-5 text-body-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.income }} />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.conversion }} />
          Conversion
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-bg-hover border border-border" />
          Remaining
        </span>
      </div>

      <div className="flex">
        {/* Fixed left axis: evenly spaced income tick marks */}
        <svg
          width={leftLabelWidth}
          height={CHART_HEIGHT}
          className="flex-shrink-0"
        >
          {incomeTicks.map((val) => {
            const y = yScale(val);
            return (
              <g key={`tick-${val}`}>
                <line
                  x1={leftLabelWidth - 4}
                  y1={y}
                  x2={leftLabelWidth}
                  y2={y}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1}
                />
                <text
                  x={leftLabelWidth - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-text-tertiary"
                  fontFamily="'Manrope', system-ui"
                >
                  ${Math.round(val / 1000)}K
                </text>
              </g>
            );
          })}
        </svg>

        {/* Scrollable bar area */}
        <div className="scroll-fade flex-1 min-w-0">
        <div
          ref={scrollRef}
          className="overflow-x-auto bracket-chart-scroll"
        >
          <svg
            width={Math.max(totalBarWidth, 200)}
            height={CHART_HEIGHT}
            className="block"
          >
            {/* Bracket boundary lines */}
            {brackets.map((b) => {
              if (b.max > chartMax) return null;
              const y = yScale(b.max);
              const color =
                BRACKET_COLORS[b.rate.toFixed(2)] || "#E5E7EB";
              return (
                <line
                  key={`line-${b.rate}`}
                  x1={0}
                  y1={y}
                  x2={totalBarWidth}
                  y2={y}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  opacity={0.5}
                />
              );
            })}

            {/* Bars */}
            {years.map((yearData, i) => {
              const x = i * (BAR_WIDTH + BAR_GAP) + BAR_GAP / 2;
              return (
                <BracketBar
                  key={yearData.year}
                  x={x}
                  yearData={yearData}
                  chartMax={chartMax}
                  yScale={yScale}
                  barWidth={BAR_WIDTH}
                  chartHeight={CHART_HEIGHT}
                  bottomPadding={BOTTOM_PADDING}
                />
              );
            })}

            {/* X axis: year labels */}
            {years.map((yearData, i) => {
              const x =
                i * (BAR_WIDTH + BAR_GAP) + BAR_GAP / 2 + BAR_WIDTH / 2;
              return (
                <text
                  key={`label-${yearData.year}`}
                  x={x}
                  y={CHART_HEIGHT - 6}
                  textAnchor="middle"
                  className="text-[10px] fill-text-tertiary"
                  fontFamily="'Manrope', system-ui"
                >
                  {yearData.year}
                </text>
              );
            })}
          </svg>
        </div>
        </div>

        {/* Fixed right axis: bracket rate + dollar range */}
        <svg
          width={rightLabelWidth}
          height={CHART_HEIGHT}
          className="flex-shrink-0"
        >
          {brackets.map((b) => {
            if (b.max > chartMax) return null;
            const y = yScale(b.max);
            const color =
              BRACKET_COLORS[b.rate.toFixed(2)] || "#6B7280";
            return (
              <text
                key={b.rate}
                x={6}
                y={y + 4}
                className="text-[11px] font-medium"
                fontFamily="'Manrope', system-ui"
                fill={color}
              >
                {formatPercent(b.rate)} (${Math.round(b.max / 1000)}K)
              </text>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

interface BracketBarProps {
  x: number;
  yearData: YearData;
  chartMax: number;
  yScale: (dollars: number) => number;
  barWidth: number;
  chartHeight: number;
  bottomPadding: number;
}

function BracketBar({
  x,
  yearData,
  chartMax,
  yScale,
  barWidth,
  chartHeight,
  bottomPadding,
}: BracketBarProps) {
  const barBottom = chartHeight - bottomPadding;

  return (
    <g>
      {yearData.bracketFill.map((bf) => {
        if (bf.bracket_min >= chartMax) return null;

        const segmentTop = Math.min(
          bf.bracket_min + bf.filled_by_income + bf.filled_by_conversion,
          bf.bracket_max
        );
        const bracketVisibleMax = Math.min(bf.bracket_max, chartMax);

        // Remaining capacity segment (background)
        const remainingBottom = yScale(
          bf.bracket_min + bf.filled_by_income + bf.filled_by_conversion
        );
        const remainingTop = yScale(bracketVisibleMax);
        const remainingHeight = remainingBottom - remainingTop;

        // Income segment
        const incomeBottom = yScale(bf.bracket_min);
        const incomeTop = yScale(bf.bracket_min + bf.filled_by_income);
        const incomeHeight = incomeBottom - incomeTop;

        // Conversion segment
        const convBottom = yScale(bf.bracket_min + bf.filled_by_income);
        const convTop = yScale(segmentTop);
        const convHeight = convBottom - convTop;

        return (
          <g key={bf.bracket_rate}>
            {/* Remaining capacity (warm light background) */}
            {remainingHeight > 1 && (
              <rect
                x={x}
                y={remainingTop}
                width={barWidth}
                height={remainingHeight}
                fill={CHART_COLORS.remaining}
                stroke={CHART_COLORS.remainingStroke}
                strokeWidth={0.5}
                rx={2}
              />
            )}

            {/* Income portion */}
            {incomeHeight > 1 && (
              <rect
                x={x}
                y={incomeTop}
                width={barWidth}
                height={incomeHeight}
                fill={CHART_COLORS.income}
                rx={2}
                className="transition-all duration-300"
              />
            )}

            {/* Conversion portion */}
            {convHeight > 1 && (
              <rect
                x={x}
                y={convTop}
                width={barWidth}
                height={convHeight}
                fill={CHART_COLORS.conversion}
                rx={2}
                className="transition-all duration-300"
              />
            )}

          </g>
        );
      })}
    </g>
  );
}
