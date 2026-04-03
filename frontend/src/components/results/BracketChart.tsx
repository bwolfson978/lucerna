"use client";

import type { BracketFillResult } from "@/lib/types";
import { formatPercent, formatCurrency, formatAxisCurrency } from "@/lib/utils/formatting";
import { BRACKET_COLORS, CHART_COLORS } from "@/lib/utils/constants";
import { useRef, useMemo, useState, useCallback, useEffect, type RefObject } from "react";
import { Card } from "@/components/ui/card";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { useScrollFade } from "@/hooks/useScrollFade";

interface ChartTooltip {
  x: number;
  y: number;
  year: number;
  age: number;
  bracketFill: BracketFillResult[];
}

interface YearData {
  year: number;
  age: number;
  bracketFill: BracketFillResult[];
}

interface BracketChartProps {
  years: YearData[];
  filingStatus: "single" | "married_filing_jointly";
  scrollRef?: RefObject<HTMLDivElement | null>;
  onBarWidthChange?: (barWidth: number) => void;
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

export const BAR_GAP = 10;
export const MIN_BAR_WIDTH = 24;
export const DEFAULT_BAR_WIDTH = 48;
const DESKTOP_CHART_HEIGHT = 320;
const MOBILE_CHART_HEIGHT = 260;
const TOP_PADDING = 16;
const BOTTOM_PADDING = 40;
const MOBILE_BREAKPOINT = 500;
const LEFT_AXIS_WIDTH_DESKTOP = 70;
const LEFT_AXIS_WIDTH_MOBILE = 55;
const RIGHT_AXIS_WIDTH_DESKTOP = 90;
const RIGHT_AXIS_WIDTH_MOBILE = 36;
const VERTICAL_LABEL_WIDTH = 18;

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

export function BracketChart({ years, filingStatus, scrollRef: externalScrollRef, onBarWidthChange }: BracketChartProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef || internalScrollRef;
  const fadeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const brackets = BRACKET_BOUNDARIES[filingStatus];
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const [isEngaged, setIsEngaged] = useState(false);

  const containerWidth = useContainerWidth(containerRef);
  const { hasScrolled } = useScrollFade(scrollRef, fadeRef);

  // Dismiss tooltip and disengage when clicking outside the chart
  useEffect(() => {
    function handleOutsideClick(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsEngaged(false);
        setTooltip(null);
      }
    }
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  // Responsive layout computation
  const layout = useMemo(() => {
    const isMobile = containerWidth !== undefined && containerWidth < MOBILE_BREAKPOINT;
    const chartHeight = isMobile ? MOBILE_CHART_HEIGHT : DESKTOP_CHART_HEIGHT;
    const leftAxisWidth = isMobile ? LEFT_AXIS_WIDTH_MOBILE : LEFT_AXIS_WIDTH_DESKTOP;
    const rightAxisWidth = isMobile ? RIGHT_AXIS_WIDTH_MOBILE : RIGHT_AXIS_WIDTH_DESKTOP;

    // Right axis is always inline; vertical labels hidden on mobile
    const verticalLabelWidth = isMobile ? 0 : VERTICAL_LABEL_WIDTH;
    const totalOverhead = verticalLabelWidth + leftAxisWidth + rightAxisWidth + verticalLabelWidth;

    let barWidth = DEFAULT_BAR_WIDTH;
    let barsFit = true;

    if (containerWidth !== undefined && years.length > 0) {
      const availableForBars = containerWidth - totalOverhead;
      const computed = Math.floor((availableForBars - BAR_GAP) / years.length) - BAR_GAP;
      if (computed >= MIN_BAR_WIDTH) {
        barWidth = Math.min(computed, DEFAULT_BAR_WIDTH);
        barsFit = true;
      } else {
        barWidth = MIN_BAR_WIDTH;
        barsFit = false;
      }
    }

    const totalBarWidth = years.length * (barWidth + BAR_GAP);

    return { isMobile, chartHeight, leftAxisWidth, rightAxisWidth, barWidth, totalBarWidth, barsFit };
  }, [containerWidth, years.length]);

  const { isMobile, chartHeight, leftAxisWidth, rightAxisWidth, barWidth, totalBarWidth, barsFit } = layout;

  // Notify parent of bar slot width for table column alignment
  useEffect(() => {
    onBarWidthChange?.(barWidth + BAR_GAP);
  }, [barWidth, onBarWidthChange]);

  // Tooltip handler: only show if chart is already engaged
  const handleBarInteraction = useCallback((e: React.MouseEvent | React.PointerEvent, yearData: YearData) => {
    if (!isEngaged) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      year: yearData.year,
      age: yearData.age,
      bracketFill: yearData.bracketFill,
    });
  }, [isEngaged]);

  const handleBarLeave = useCallback(() => setTooltip(null), []);

  // First click/tap in chart area engages; subsequent interactions show tooltip
  const handleChartPointerDown = useCallback(() => {
    if (!isEngaged) {
      setIsEngaged(true);
    }
  }, [isEngaged]);

  // Determine max Y value: highest bracket that any year reaches into, plus one
  const maxFilledBracketRate = useMemo(() => {
    let maxRate = 0.12;
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
    const showIdx = Math.min(idx + 1, brackets.length - 1);
    return brackets[showIdx];
  }, [brackets, maxFilledBracketRate]);

  const chartMax = maxBracket.max;
  const drawableHeight = chartHeight - TOP_PADDING - BOTTOM_PADDING;

  const yScale = useCallback(
    (dollars: number) => {
      const ratio = dollars / chartMax;
      return chartHeight - BOTTOM_PADDING - ratio * drawableHeight;
    },
    [chartMax, chartHeight, drawableHeight]
  );

  const incomeTicks = useMemo(() => {
    const interval = niceInterval(chartMax, isMobile ? 4 : 5);
    const ticks: number[] = [];
    for (let v = 0; v <= chartMax; v += interval) {
      ticks.push(v);
    }
    return ticks;
  }, [chartMax, isMobile]);

  const visibleBrackets = useMemo(
    () => brackets.filter((b) => b.max <= chartMax),
    [brackets, chartMax]
  );

  return (
    <Card className="flex flex-col gap-default">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.income }} />
          Earned Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded" style={{ backgroundColor: CHART_COLORS.conversion }} />
          Conversion
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-bg-hover border border-border" />
          Remaining space in tax bracket
        </span>
      </div>

      <div
        ref={containerRef}
        className="flex relative"
        onPointerDown={handleChartPointerDown}
        onMouseLeave={() => {
          setIsEngaged(false);
          setTooltip(null);
        }}
      >
        {/* Left axis label (desktop only) */}
        {!isMobile && (
          <div className="flex-shrink-0 flex items-center" style={{ width: VERTICAL_LABEL_WIDTH }}>
            <span
              className="text-[11px] text-text-tertiary tracking-wider uppercase"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                fontFamily: "'Inter', system-ui",
              }}
            >
              Income
            </span>
          </div>
        )}

        {/* Fixed left axis: evenly spaced income tick marks */}
        <svg
          width={leftAxisWidth}
          height={chartHeight}
          className="flex-shrink-0"
        >
          {incomeTicks.map((val) => {
            const y = yScale(val);
            return (
              <g key={`tick-${val}`}>
                <line
                  x1={leftAxisWidth - 4}
                  y1={y}
                  x2={leftAxisWidth}
                  y2={y}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1}
                />
                <text
                  x={leftAxisWidth - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-text-tertiary"
                  fontFamily="'Manrope', system-ui"
                >
                  {formatAxisCurrency(val)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Scrollable bar area */}
        <div ref={fadeRef} className={`flex-1 min-w-0 ${!barsFit ? "scroll-fade mb-2" : ""}`}>
          {/* Scroll hint pill — shown until first scroll */}
          {!barsFit && !hasScrolled && (
            <div className="absolute inset-0 flex items-center justify-end pr-3 pointer-events-none z-10 animate-fade-out-delayed">
              <div className="flex items-center gap-1 text-[10px] text-accent/70 bg-card/80 backdrop-blur-sm rounded-full px-2.5 py-1">
                <span>Scroll</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          )}
          <div
            ref={scrollRef}
            className={!barsFit ? "overflow-x-auto bracket-chart-scroll pb-2" : ""}
          >
            <svg
              width={Math.max(totalBarWidth, 200)}
              height={chartHeight}
              className="block"
            >
              <defs>
                <linearGradient id="barFadeGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="white" stopOpacity="0.85" />
                  <stop offset="70%" stopColor="white" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="white" stopOpacity="0.3" />
                </linearGradient>
                {years.map((yearData, i) => {
                  const maskX = i * (barWidth + BAR_GAP) + BAR_GAP / 2;
                  return (
                    <mask key={`mask-${yearData.year}`} id={`barMask-${i}`}>
                      <rect
                        x={maskX}
                        y={0}
                        width={barWidth}
                        height={chartHeight}
                        fill="url(#barFadeGrad)"
                      />
                    </mask>
                  );
                })}
              </defs>
              {/* Bracket boundary lines */}
              {visibleBrackets.map((b) => {
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
                const x = i * (barWidth + BAR_GAP) + BAR_GAP / 2;
                return (
                  <BracketBar
                    key={yearData.year}
                    x={x}
                    yearData={yearData}
                    chartMax={chartMax}
                    yScale={yScale}
                    barWidth={barWidth}
                    chartHeight={chartHeight}
                    bottomPadding={BOTTOM_PADDING}
                    onHover={handleBarInteraction}
                    onLeave={handleBarLeave}
                    maskIndex={i}
                  />
                );
              })}

              {/* X axis: year labels */}
              {years.map((yearData, i) => {
                const x =
                  i * (barWidth + BAR_GAP) + BAR_GAP / 2 + barWidth / 2;
                return (
                  <text
                    key={`label-${yearData.year}`}
                    x={x}
                    y={chartHeight - 6}
                    textAnchor="middle"
                    className={`${barWidth < 36 ? "text-[9px]" : "text-[10px]"} fill-text-tertiary`}
                    fontFamily="'Manrope', system-ui"
                  >
                    {yearData.year}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Fixed right axis: bracket rates — always visible */}
        <svg
          width={rightAxisWidth}
          height={chartHeight}
          className="flex-shrink-0"
        >
          {visibleBrackets.map((b) => {
            const y = yScale(b.max);
            const color =
              BRACKET_COLORS[b.rate.toFixed(2)] || "#6B7280";
            return (
              <text
                key={b.rate}
                x={6}
                y={y + 4}
                className={`${isMobile ? "text-[9px]" : "text-[11px]"} font-medium`}
                fontFamily="'Manrope', system-ui"
                fill={color}
              >
                {isMobile
                  ? formatPercent(b.rate)
                  : `${formatPercent(b.rate)} (${formatAxisCurrency(b.max)})`}
              </text>
            );
          })}
        </svg>

        {/* Right axis label (desktop only) */}
        {!isMobile && (
          <div className="flex-shrink-0 flex items-center" style={{ width: VERTICAL_LABEL_WIDTH }}>
            <span
              className="text-[11px] text-text-tertiary tracking-wider uppercase"
              style={{
                writingMode: "vertical-rl",
                fontFamily: "'Inter', system-ui",
              }}
            >
              Tax Brackets
            </span>
          </div>
        )}

        {/* Hover tooltip — only shown when chart is engaged */}
        {tooltip && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: Math.min(tooltip.x + 16, (containerWidth || 400) - 200),
              top: tooltip.y - 8,
            }}
          >
            <div
              className="rounded-[12px] border border-glass-border px-4 py-3 text-body-sm min-w-[180px]"
              style={{
                background: "rgba(26, 24, 50, 0.95)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 12px 40px rgba(15, 14, 26, 0.5)",
              }}
            >
              <div className="text-text-primary font-semibold mb-2">
                {tooltip.year} <span className="text-text-tertiary font-normal">(age {tooltip.age})</span>
              </div>
              {(() => {
                const totalIncome = tooltip.bracketFill.reduce((s, bf) => s + bf.filled_by_income, 0);
                const totalConversion = tooltip.bracketFill.reduce((s, bf) => s + bf.filled_by_conversion, 0);
                return (
                  <div className="flex flex-col gap-1.5">
                    {totalIncome > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.income }} />
                          <span className="text-text-secondary">Earned Income</span>
                        </span>
                        <span className="text-text-primary font-medium">{formatCurrency(totalIncome)}</span>
                      </div>
                    )}
                    {totalConversion > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.conversion }} />
                          <span className="text-text-secondary">Conversion</span>
                        </span>
                        <span className="text-text-primary font-medium">{formatCurrency(totalConversion)}</span>
                      </div>
                    )}
                    <div className="border-t border-glass-border mt-1 pt-1.5 flex justify-between text-text-primary text-[12px] font-medium">
                      <span>Total</span>
                      <span>{formatCurrency(totalIncome + totalConversion)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
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
  onHover: (e: React.MouseEvent | React.PointerEvent, yearData: YearData) => void;
  onLeave: () => void;
  maskIndex: number;
}

function BracketBar({
  x,
  yearData,
  chartMax,
  yScale,
  barWidth,
  chartHeight,
  bottomPadding,
  onHover,
  onLeave,
  maskIndex,
}: BracketBarProps) {
  const barBottom = chartHeight - bottomPadding;

  return (
    <g
      onMouseMove={(e) => onHover(e, yearData)}
      onMouseLeave={onLeave}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") onHover(e, yearData);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") onLeave();
      }}
      className="cursor-pointer"
      mask={`url(#barMask-${maskIndex})`}
    >
      {/* Invisible hit area for entire column */}
      <rect
        x={x}
        y={0}
        width={barWidth}
        height={barBottom}
        fill="transparent"
      />
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
