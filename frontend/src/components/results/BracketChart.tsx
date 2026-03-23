"use client";

import type { BracketFillResult } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { BRACKET_COLORS } from "@/lib/utils/constants";
import { useRef, useMemo } from "react";

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

  const totalBarWidth = years.length * (BAR_WIDTH + BAR_GAP);
  const leftLabelWidth = 70;
  const rightLabelWidth = 50;

  return (
    <div className="card flex flex-col gap-default">
      {/* Legend */}
      <div className="flex items-center gap-5 text-body-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: "#8B5CF6" }} />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: "#059669" }} />
          Conversion
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-bg-hover border border-border" />
          Remaining
        </span>
      </div>

      <div className="flex">
        {/* Fixed left axis: dollar amounts */}
        <svg
          width={leftLabelWidth}
          height={CHART_HEIGHT}
          className="flex-shrink-0"
        >
          {brackets.map((b) => {
            if (b.max > chartMax) return null;
            const y = yScale(b.max);
            return (
              <text
                key={b.rate}
                x={leftLabelWidth - 6}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-text-tertiary"
                fontFamily="'JetBrains Mono', monospace"
              >
                ${Math.round(b.max / 1000)}K
              </text>
            );
          })}
        </svg>

        {/* Scrollable bar area */}
        <div
          ref={scrollRef}
          className="overflow-x-auto flex-1 bracket-chart-scroll"
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
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {yearData.year}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Fixed right axis: bracket rate labels */}
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
                fontFamily="'JetBrains Mono', monospace"
                fill={color}
              >
                {formatPercent(b.rate)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
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

        const bracketColor =
          BRACKET_COLORS[bf.bracket_rate.toFixed(2)] || "#6B7280";

        return (
          <g key={bf.bracket_rate}>
            {/* Remaining capacity (warm light background) */}
            {remainingHeight > 1 && (
              <rect
                x={x}
                y={remainingTop}
                width={barWidth}
                height={remainingHeight}
                fill="rgba(120, 113, 108, 0.04)"
                stroke="rgba(120, 113, 108, 0.08)"
                strokeWidth={0.5}
                rx={2}
              />
            )}

            {/* Income portion (warm stone gray) */}
            {incomeHeight > 1 && (
              <rect
                x={x}
                y={incomeTop}
                width={barWidth}
                height={incomeHeight}
                fill="#8B5CF6"
                rx={2}
                className="transition-all duration-300"
              />
            )}

            {/* Conversion portion (warm amber) */}
            {convHeight > 1 && (
              <rect
                x={x}
                y={convTop}
                width={barWidth}
                height={convHeight}
                fill="#059669"
                rx={2}
                className="transition-all duration-300"
              />
            )}

            {/* Left bracket color indicator */}
            <rect
              x={x - 3}
              y={yScale(bracketVisibleMax)}
              width={2}
              height={yScale(bf.bracket_min) - yScale(bracketVisibleMax)}
              fill={bracketColor}
              rx={1}
            />
          </g>
        );
      })}
    </g>
  );
}
