"use client";

import type { BracketFillResult } from "@/lib/types";
import { formatPercent, formatCurrency, formatAxisCurrency } from "@/lib/utils/formatting";
import { BRACKET_COLORS, CHART_COLORS } from "@/lib/utils/constants";
import { DATA_FONT_FAMILY } from "@/lib/utils/constants";
import { useRef, useMemo, useState, useCallback, useEffect, type RefObject } from "react";
import { useContainerWidth } from "@/hooks/useContainerWidth";
import { useScrollFade } from "@/hooks/useScrollFade";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { useTaxConfig, type TaxBracket } from "@/lib/tax/TaxConfigProvider";

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
  rmdAmount?: number;
}

interface BracketChartProps {
  years: YearData[];
  filingStatus: "single" | "married_filing_jointly";
  scrollRef?: RefObject<HTMLDivElement | null>;
  onBarWidthChange?: (barWidth: number) => void;
  onLayoutChange?: (layout: {
    leftOffset: number;
    rightOffset: number;
    verticalLabelWidth: number;
    axisLabelStart: number;
  }) => void;
  /** Content rendered below the chart SVG inside the shared scroll container */
  children?: React.ReactNode;
  /** Content rendered below the left axis (fixed, for row labels) */
  leftBottomContent?: React.ReactNode;
  /** Hide the built-in series legend (when rendered externally) */
  hideLegend?: boolean;
}

// Derive bracket boundaries from tax config.
// For the top bracket (max: null/Infinity), use min + 500K as display max.
function buildBoundaries(raw: TaxBracket[]) {
  return raw.map((b) => ({
    rate: b.rate,
    max: b.max === null ? b.min + 500000 : b.max,
  }));
}

export const BAR_GAP = 10;
export const MIN_BAR_WIDTH = 24;
export const DEFAULT_BAR_WIDTH = 48;
const MIN_DESKTOP_CHART_HEIGHT = 320;
const MAX_DESKTOP_CHART_HEIGHT = 480;
const MOBILE_CHART_HEIGHT = 260;
const TOP_PADDING = 16;
const BOTTOM_PADDING = 40;
/** Minimum pixel height so small-but-nonzero segments stay visible */
const MIN_SEGMENT_HEIGHT = 3;
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

export function BracketChart({
  years,
  filingStatus,
  scrollRef: externalScrollRef,
  onBarWidthChange,
  onLayoutChange,
  children,
  leftBottomContent,
  hideLegend,
}: BracketChartProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef || internalScrollRef;
  const fadeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const taxConfig = useTaxConfig();
  const brackets = useMemo(
    () => buildBoundaries(taxConfig.brackets[filingStatus]),
    [taxConfig, filingStatus]
  );
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const [isEngaged, setIsEngaged] = useState(false);

  const containerWidth = useContainerWidth(containerRef);
  const viewportHeight = useViewportHeight();
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

    // Dynamic chart height: scale with viewport on desktop, clamped to sensible range
    let chartHeight: number;
    if (isMobile) {
      chartHeight = MOBILE_CHART_HEIGHT;
    } else if (viewportHeight !== undefined) {
      // Use ~45% of viewport height, clamped between min/max
      const desired = Math.round(viewportHeight * 0.45);
      chartHeight = Math.max(MIN_DESKTOP_CHART_HEIGHT, Math.min(desired, MAX_DESKTOP_CHART_HEIGHT));
    } else {
      chartHeight = MIN_DESKTOP_CHART_HEIGHT;
    }

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
        // Let bars expand to fill available space — no hard cap
        barWidth = computed;
        barsFit = true;
      } else {
        barWidth = MIN_BAR_WIDTH;
        barsFit = false;
      }
    }

    const totalBarWidth = years.length > 0 ? years.length * (barWidth + BAR_GAP) - BAR_GAP : 0;

    return {
      isMobile,
      chartHeight,
      leftAxisWidth,
      rightAxisWidth,
      barWidth,
      totalBarWidth,
      barsFit,
    };
  }, [containerWidth, viewportHeight, years.length]);

  const { isMobile, chartHeight, leftAxisWidth, rightAxisWidth, barWidth, totalBarWidth, barsFit } =
    layout;

  // Notify parent of bar slot width for table column alignment
  useEffect(() => {
    onBarWidthChange?.(barWidth + BAR_GAP);
  }, [barWidth, onBarWidthChange]);

  // Notify parent of fixed-area dimensions so the table can match
  const verticalLabelWidth = isMobile ? 0 : VERTICAL_LABEL_WIDTH;
  useEffect(() => {
    onLayoutChange?.({
      leftOffset: verticalLabelWidth + leftAxisWidth,
      rightOffset: rightAxisWidth + verticalLabelWidth,
      verticalLabelWidth,
      // Left edge of right-aligned axis labels (textAnchor="end" at leftAxisWidth - 6).
      // Approximate label width ~30px for "$250K" style text at small size.
      axisLabelStart: verticalLabelWidth + Math.round(leftAxisWidth * 0.4),
    });
  }, [onLayoutChange, verticalLabelWidth, leftAxisWidth, rightAxisWidth]);

  // Tooltip handler: only show if chart is already engaged
  const handleBarInteraction = useCallback(
    (e: React.MouseEvent | React.PointerEvent, yearData: YearData) => {
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
    },
    [isEngaged]
  );

  const handleBarLeave = useCallback(() => setTooltip(null), []);

  // First click/tap in chart area engages; subsequent interactions show tooltip
  const handleChartPointerDown = useCallback(() => {
    if (!isEngaged) {
      setIsEngaged(true);
    }
  }, [isEngaged]);

  const hasRmd = useMemo(() => years.some((y) => (y.rmdAmount ?? 0) > 0), [years]);

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
    // If rate not found (-1), show the highest bracket; otherwise show one above
    const showIdx = idx === -1 ? brackets.length - 1 : Math.min(idx + 1, brackets.length - 1);
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
    <div className="flex flex-col gap-default">
      {/* Legend */}
      {!hideLegend && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ backgroundColor: CHART_COLORS.income }} />
            Earned Income
          </span>
          {hasRmd && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded" style={{ backgroundColor: CHART_COLORS.rmd }} />
              Required withdrawal
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded"
              style={{ backgroundColor: CHART_COLORS.conversion }}
            />
            Roth Conversion
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-border bg-bg-hover" />
            Remaining space in tax bracket
          </span>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative flex"
        onPointerDown={handleChartPointerDown}
        onMouseLeave={() => {
          setIsEngaged(false);
          setTooltip(null);
        }}
      >
        {/* Left axis label (desktop only) */}
        {!isMobile && (
          <div
            className="flex flex-shrink-0 items-center self-start"
            style={{ width: VERTICAL_LABEL_WIDTH, height: chartHeight }}
          >
            <span
              className="text-caption uppercase tracking-wider text-text-tertiary"
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

        {/* Fixed left axis: evenly spaced income tick marks + bottom label slot */}
        <div className="flex flex-shrink-0 flex-col" style={{ width: leftAxisWidth }}>
          <svg className="overflow-hidden" width={leftAxisWidth} height={chartHeight}>
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
                    className="fill-text-tertiary text-data-xs"
                    fontFamily={DATA_FONT_FAMILY}
                  >
                    {formatAxisCurrency(val)}
                  </text>
                </g>
              );
            })}
          </svg>
          {leftBottomContent}
        </div>

        {/* Scrollable bar area */}
        <div ref={fadeRef} className={`min-w-0 flex-1 ${!barsFit ? "scroll-fade mb-2" : ""}`}>
          {/* Scroll hint pill — shown until first scroll */}
          {!barsFit && !hasScrolled && (
            <div className="animate-fade-out-delayed pointer-events-none absolute inset-0 z-10 flex items-center justify-end pr-3">
              <div className="flex items-center gap-1 rounded-full bg-card/80 px-2.5 py-1 text-data-xs text-accent/70 backdrop-blur-sm">
                <span>Scroll</span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4.5 2.5L8 6L4.5 9.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}
          <div
            ref={scrollRef}
            className={!barsFit ? "bracket-chart-scroll overflow-x-auto pb-2" : ""}
          >
            <div style={!barsFit ? { width: Math.max(totalBarWidth, 200) } : undefined}>
              <svg width="100%" height={chartHeight} className="block">
                <defs>
                  <linearGradient id="barFadeGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="white" stopOpacity="0.85" />
                    <stop offset="70%" stopColor="white" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="white" stopOpacity="0.3" />
                  </linearGradient>
                  {years.map((yearData, i) => {
                    const maskX = i * (barWidth + BAR_GAP);
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
                  const color = BRACKET_COLORS[b.rate.toFixed(2)] || "#E5E7EB";
                  return (
                    <line
                      key={`line-${b.rate}`}
                      x1={0}
                      y1={y}
                      x2={barsFit ? "100%" : totalBarWidth}
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
                  const x = i * (barWidth + BAR_GAP);
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
                  const x = i * (barWidth + BAR_GAP) + barWidth / 2;
                  return (
                    <text
                      key={`label-${yearData.year}`}
                      x={x}
                      y={chartHeight - 6}
                      textAnchor="middle"
                      className={`${barWidth < 36 ? "text-[11px]" : "text-data-xs"} fill-text-tertiary`}
                      fontFamily={DATA_FONT_FAMILY}
                    >
                      {yearData.year}
                    </text>
                  );
                })}
              </svg>
              {children}
            </div>
          </div>
        </div>

        {/* Fixed right axis: bracket rates — always visible */}
        <svg width={rightAxisWidth} height={chartHeight} className="flex-shrink-0 self-start">
          {visibleBrackets.map((b) => {
            const y = yScale(b.max);
            const color = BRACKET_COLORS[b.rate.toFixed(2)] || "#6B7280";
            return (
              <text
                key={b.rate}
                x={6}
                y={y + 4}
                className={`${isMobile ? "text-[11px]" : "text-caption"} font-medium`}
                fontFamily={DATA_FONT_FAMILY}
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
          <div
            className="flex flex-shrink-0 items-center self-start"
            style={{ width: VERTICAL_LABEL_WIDTH, height: chartHeight }}
          >
            <span
              className="text-caption uppercase tracking-wider text-text-tertiary"
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
            className="pointer-events-none absolute z-50"
            style={{
              left: Math.min(tooltip.x + 16, (containerWidth || 400) - 200),
              top: tooltip.y - 8,
            }}
          >
            <div
              className="min-w-[180px] rounded-[12px] border border-glass-border px-4 py-3 text-body-sm"
              style={{
                background: "rgba(26, 24, 50, 0.95)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 12px 40px rgba(15, 14, 26, 0.5)",
              }}
            >
              <div className="mb-2 font-semibold text-text-primary">
                {tooltip.year}{" "}
                <span className="font-normal text-text-tertiary">(age {tooltip.age})</span>
              </div>
              {(() => {
                const totalIncome = tooltip.bracketFill.reduce(
                  (s, bf) => s + bf.filled_by_income,
                  0
                );
                const totalConversion = tooltip.bracketFill.reduce(
                  (s, bf) => s + bf.filled_by_conversion,
                  0
                );
                return (
                  <div className="flex flex-col gap-1.5">
                    {totalIncome > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS.income }}
                          />
                          <span className="text-text-secondary">Earned Income</span>
                        </span>
                        <span className="font-medium text-text-primary">
                          {formatCurrency(totalIncome)}
                        </span>
                      </div>
                    )}
                    {totalConversion > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS.conversion }}
                          />
                          <span className="text-text-secondary">Conversion</span>
                        </span>
                        <span className="font-medium text-text-primary">
                          {formatCurrency(totalConversion)}
                        </span>
                      </div>
                    )}
                    <div className="mt-1 flex justify-between border-t border-glass-border pt-1.5 text-caption font-medium text-text-primary">
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

  // RMD fraction: what proportion of total income is from mandatory withdrawals
  const totalIncome = yearData.bracketFill.reduce((s, bf) => s + bf.filled_by_income, 0);
  const rmdFraction =
    totalIncome > 0 && (yearData.rmdAmount ?? 0) > 0
      ? Math.min((yearData.rmdAmount ?? 0) / totalIncome, 1)
      : 0;

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
      <rect x={x} y={0} width={barWidth} height={barBottom} fill="transparent" />
      {yearData.bracketFill.map((bf) => {
        if (bf.bracket_min >= chartMax) return null;

        const segmentTop = Math.min(
          bf.bracket_min + bf.filled_by_income + bf.filled_by_conversion,
          bf.bracket_max
        );
        const bracketVisibleMax = Math.min(bf.bracket_max, chartMax);

        // Income segment (natural)
        const rawIncomeBottom = yScale(bf.bracket_min);
        const rawIncomeTop = yScale(bf.bracket_min + bf.filled_by_income);
        const rawIncomeHeight = rawIncomeBottom - rawIncomeTop;

        // Enforce minimum height for nonzero income
        const incomeHeight =
          bf.filled_by_income > 0 ? Math.max(rawIncomeHeight, MIN_SEGMENT_HEIGHT) : 0;
        const incomeBottom = rawIncomeBottom;
        const incomeTop = incomeBottom - incomeHeight;

        // Split income into base (bottom) and RMD (top)
        const rmdHeight = Math.round(incomeHeight * rmdFraction);
        const baseHeight = incomeHeight - rmdHeight;

        // Conversion segment stacks on top of (possibly expanded) income
        const rawConvHeight = yScale(bf.bracket_min + bf.filled_by_income) - yScale(segmentTop);

        const convHeight =
          bf.filled_by_conversion > 0 ? Math.max(rawConvHeight, MIN_SEGMENT_HEIGHT) : 0;
        const convBottom = incomeTop;
        const convTop = convBottom - convHeight;

        // Remaining capacity sits on top of the filled segments
        const remainingTop = yScale(bracketVisibleMax);
        const remainingBottom = convHeight > 0 ? convTop : incomeTop;
        const remainingHeight = Math.max(remainingBottom - remainingTop, 0);

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

            {/* Base income portion (bottom of income stack) */}
            {baseHeight > 0 && (
              <rect
                x={x}
                y={incomeTop + rmdHeight}
                width={barWidth}
                height={baseHeight}
                fill={CHART_COLORS.income}
                rx={2}
              />
            )}

            {/* RMD portion (top of income stack, above base income) */}
            {rmdHeight > 0 && (
              <rect
                x={x}
                y={incomeTop}
                width={barWidth}
                height={rmdHeight}
                fill={CHART_COLORS.rmd}
                rx={2}
              />
            )}

            {/* Conversion portion */}
            {convHeight > 0 && (
              <rect
                x={x}
                y={convTop}
                width={barWidth}
                height={convHeight}
                fill={CHART_COLORS.conversion}
                rx={2}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
