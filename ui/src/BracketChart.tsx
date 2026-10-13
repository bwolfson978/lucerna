"use client";

import {
  useRef,
  useMemo,
  useState,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { BRACKET_COLORS, CHART_COLORS } from "./colors";
import { formatAxisCurrency, formatCurrency, formatTableCurrency } from "./format";
import { useContainerWidth, useScrollFade, useViewportHeight } from "./charts/hooks";

/**
 * The tax bracket chart: each year's income, required withdrawal and Roth conversion
 * stacked against the federal brackets, with the space left in each bracket. One
 * component for the results page, the conversation's result card and the MCP App View.
 * Plain data in; the brackets and standard deduction come from the caller.
 */

/** A federal bracket in taxable income; `max` is null for the top bracket. */
export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}

export interface BracketChartYear {
  year: number;
  age?: number;
  /** Gross income other than the conversion and any required withdrawal. */
  income?: number;
  rmdAmount?: number;
  conversion?: number;
}

export interface BracketChartLayout {
  leftOffset: number;
  rightOffset: number;
  verticalLabelWidth: number;
  axisLabelStart: number;
}

interface ChartTooltip extends BracketChartYear {
  x: number;
  y: number;
}

type YearData = BracketChartYear;

const DATA_FONT_FAMILY = "'Inter', system-ui";
const dataFontStyle = { fontFamily: DATA_FONT_FAMILY, fontVariantNumeric: "tabular-nums" } as const;

function formatPercent(decimal: number): string {
  return `${Math.round(decimal * 100)}%`;
}

interface BracketChartProps {
  years: YearData[];
  /** Federal brackets for the filing status, in taxable income. */
  brackets: TaxBracket[];
  /** Standard deduction for the filing status, drawn as the 0% band. */
  standardDeduction: number;
  /** Added tax from the conversion each year, shown as a row under the bars. */
  addedTax?: (number | null | undefined)[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  onBarWidthChange?: (barWidth: number) => void;
  onLayoutChange?: (layout: BracketChartLayout) => void;
  /** Hide the built-in series legend (when rendered externally) */
  hideLegend?: boolean;
  /**
   * Stable max gross amount (income + rmd + conversion) pre-computed from the
   * full conversion curve. When provided, the chart Y-scale is fixed to this
   * value and does not rescale as the slider moves, preventing the jarring
   * "jump" that occurs when per-year gross crosses a bracket boundary.
   */
  stableMaxGrossAmount?: number;
  /**
   * Keep the minimum desktop height instead of growing with the window. On for cards:
   * inside an MCP App View the window is the iframe, so its height is not the page's.
   */
  fixedHeight?: boolean;
}

// Build gross-scale bracket boundaries from tax config.
// Prepends a 0% standard-deduction zone so bars represent gross income/conversion
// and bracket lines sit at the correct gross-dollar positions.
function buildGrossBrackets(
  raw: TaxBracket[],
  deduction: number
): { rate: number; min: number; max: number }[] {
  const result: { rate: number; min: number; max: number }[] = [
    { rate: 0, min: 0, max: deduction },
  ];
  for (const b of raw) {
    const taxableMax = b.max === null ? b.min + 500000 : b.max;
    result.push({ rate: b.rate, min: deduction + b.min, max: deduction + taxableMax });
  }
  return result;
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
  brackets,
  standardDeduction,
  addedTax,
  scrollRef: externalScrollRef,
  onBarWidthChange,
  onLayoutChange,
  hideLegend,
  stableMaxGrossAmount,
  fixedHeight = false,
}: BracketChartProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef || internalScrollRef;
  const fadeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const grossBrackets = useMemo(
    () => buildGrossBrackets(brackets, standardDeduction),
    [brackets, standardDeduction]
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
    } else if (!fixedHeight && viewportHeight !== undefined) {
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
  }, [containerWidth, viewportHeight, fixedHeight, years.length]);

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
    (e: ReactMouseEvent | ReactPointerEvent, yearData: YearData) => {
      if (!isEngaged) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        year: yearData.year,
        age: yearData.age,
        rmdAmount: yearData.rmdAmount,
        conversion: yearData.conversion,
        income: yearData.income,
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

  // Max gross amount (income + rmd + conversion) across all years — drives chart scale.
  // When stableMaxGrossAmount is provided (pre-computed from the full conversion curve),
  // use it directly so the Y-axis does not rescale as the slider moves.
  const maxGrossAmount = useMemo(() => {
    const base =
      stableMaxGrossAmount !== undefined
        ? stableMaxGrossAmount
        : (() => {
            let max = 0;
            for (const y of years) {
              const gross = (y.income ?? 0) + (y.rmdAmount ?? 0) + (y.conversion ?? 0);
              if (gross > max) max = gross;
            }
            return max;
          })();
    // Minimum scale: show at least through the 12% bracket on the gross scale
    return Math.max(base, grossBrackets[2]?.max ?? 0);
  }, [stableMaxGrossAmount, years, grossBrackets]);

  // Find the gross bracket one level above the highest filled year — gives headroom
  const maxBracket = useMemo(() => {
    let containingIdx = 0;
    for (let i = 0; i < grossBrackets.length; i++) {
      if (grossBrackets[i].min <= maxGrossAmount) containingIdx = i;
    }
    const showIdx = Math.min(containingIdx + 1, grossBrackets.length - 1);
    return grossBrackets[showIdx];
  }, [grossBrackets, maxGrossAmount]);

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

  const visibleGrossBrackets = useMemo(
    () => grossBrackets.filter((b) => b.max <= chartMax),
    [grossBrackets, chartMax]
  );

  return (
    <div className="gap-default flex flex-col">
      {/* Legend */}
      {!hideLegend && (
        <div className="text-body-sm text-text-secondary flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded" style={{ backgroundColor: CHART_COLORS.income }} />
            Other income
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
            <span className="border-border bg-bg-hover h-3 w-3 rounded border" />
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
              className="text-caption text-text-tertiary tracking-wider uppercase"
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
                    stroke="rgba(20, 20, 20, 0.15)"
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
          {addedTax && (
            <div className="border-border flex flex-col border-r">
              <div className="text-data-xs text-text-tertiary flex h-8 items-center justify-end px-1 text-right leading-tight font-medium">
                Added tax from conversion
              </div>
            </div>
          )}
        </div>

        {/* Scrollable bar area */}
        <div ref={fadeRef} className={`min-w-0 flex-1 ${!barsFit ? "scroll-fade mb-2" : ""}`}>
          {/* Scroll hint pill — shown until first scroll */}
          {!barsFit && !hasScrolled && (
            <div className="animate-fade-out-delayed pointer-events-none absolute inset-0 z-10 flex items-center justify-end pr-3">
              <div className="bg-card/80 text-data-xs text-accent/70 flex items-center gap-1 rounded-full px-2.5 py-1 backdrop-blur-sm">
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
              <svg
                width="100%"
                height={chartHeight}
                className="block"
                role="img"
                aria-label="Income and Roth conversions by year, against the tax brackets"
              >
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
                {/* Bracket boundary lines (gross-scale positions) */}
                {visibleGrossBrackets.map((b) => {
                  const y = yScale(b.max);
                  const color = BRACKET_COLORS[b.rate.toFixed(2)] || "#E5E7EB";
                  return (
                    <line
                      key={`line-${b.rate}-${b.min}`}
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
                      grossBrackets={visibleGrossBrackets}
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
              {addedTax && (
                <div className="flex">
                  {years.map((yearData, i) => {
                    const colWidth = barWidth + BAR_GAP;
                    const maxChars = Math.max(4, Math.floor((colWidth - 8) / 6.5));
                    const tax = addedTax[i];
                    return (
                      <div
                        key={yearData.year}
                        className="text-data-xs text-text-primary flex h-8 items-center justify-center px-1"
                        style={{ width: colWidth, minWidth: colWidth, ...dataFontStyle }}
                      >
                        {tax != null ? formatTableCurrency(tax, maxChars) : "-"}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed right axis: bracket rates at gross-scale positions */}
        <svg width={rightAxisWidth} height={chartHeight} className="flex-shrink-0 self-start">
          {(() => {
            const MIN_LABEL_GAP = 14;
            // Pass 1: compute nudged y positions top-to-bottom so crowded labels shift
            // down rather than being hidden. Iterate highest→lowest bracket (top→bottom
            // on screen) so each label can only push the one below it.
            const nudgedY: number[] = new Array(visibleGrossBrackets.length);
            let lastLabelY = -Infinity;
            for (let i = visibleGrossBrackets.length - 1; i >= 0; i--) {
              const natural = yScale(visibleGrossBrackets[i].max) + 4;
              const y = Math.max(natural, lastLabelY + MIN_LABEL_GAP);
              nudgedY[i] = y;
              lastLabelY = y;
            }
            return visibleGrossBrackets.map((b, i) => {
              const color = BRACKET_COLORS[b.rate.toFixed(2)] || "#6B7280";
              return (
                <text
                  key={`${b.rate}-${b.min}`}
                  x={6}
                  y={nudgedY[i]}
                  className={`${isMobile ? "text-[11px]" : "text-caption"} font-medium`}
                  fontFamily={DATA_FONT_FAMILY}
                  fill={color}
                >
                  {isMobile
                    ? formatPercent(b.rate)
                    : `${formatPercent(b.rate)} (${formatAxisCurrency(b.max)})`}
                </text>
              );
            });
          })()}
        </svg>

        {/* Right axis label (desktop only) */}
        {!isMobile && (
          <div
            className="flex flex-shrink-0 items-center self-start"
            style={{ width: VERTICAL_LABEL_WIDTH, height: chartHeight }}
          >
            <span
              className="text-caption text-text-tertiary tracking-wider uppercase"
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
              className="border-glass-border text-body-sm min-w-[180px] rounded-[12px] border px-4 py-3"
              style={{
                background: "rgba(255, 255, 255, 0.97)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 12px 40px rgba(11, 29, 21, 0.18)",
              }}
            >
              <div className="text-text-primary mb-2 font-semibold">
                {tooltip.year}
                {tooltip.age != null && (
                  <span className="text-text-tertiary font-normal"> (age {tooltip.age})</span>
                )}
              </div>
              {(() => {
                const baseIncome = tooltip.income ?? 0;
                const rmd = tooltip.rmdAmount ?? 0;
                const conversion = tooltip.conversion ?? 0;
                const grandTotal = baseIncome + rmd + conversion;
                return (
                  <div className="flex flex-col gap-1.5">
                    {baseIncome > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS.income }}
                          />
                          <span className="text-text-secondary">Other income</span>
                        </span>
                        <span className="text-text-primary font-medium">
                          {formatCurrency(baseIncome)}
                        </span>
                      </div>
                    )}
                    {rmd > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS.rmd }}
                          />
                          <span className="text-text-secondary">Required withdrawal</span>
                        </span>
                        <span className="text-text-primary font-medium">{formatCurrency(rmd)}</span>
                      </div>
                    )}
                    {conversion > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: CHART_COLORS.conversion }}
                          />
                          <span className="text-text-secondary">Conversion</span>
                        </span>
                        <span className="text-text-primary font-medium">
                          {formatCurrency(conversion)}
                        </span>
                      </div>
                    )}
                    <div className="border-glass-border text-caption text-text-primary mt-1 flex justify-between border-t pt-1.5 font-medium">
                      <span>Total</span>
                      <span>{formatCurrency(grandTotal)}</span>
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
  grossBrackets: { rate: number; min: number; max: number }[];
  chartMax: number;
  yScale: (dollars: number) => number;
  barWidth: number;
  chartHeight: number;
  bottomPadding: number;
  onHover: (e: ReactMouseEvent | ReactPointerEvent, yearData: YearData) => void;
  onLeave: () => void;
  maskIndex: number;
}

function BracketBar({
  x,
  yearData,
  grossBrackets,
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

  const grossIncome = yearData.income ?? 0;
  const grossRmd = yearData.rmdAmount ?? 0;
  const grossConv = yearData.conversion ?? 0;
  const grossTotal = grossIncome + grossRmd + grossConv;

  // Heights for the three solid bar segments
  const incomeBottom = yScale(0);
  const incomeTop =
    grossIncome > 0
      ? Math.min(yScale(grossIncome), incomeBottom - MIN_SEGMENT_HEIGHT)
      : incomeBottom;
  const incomeHeight = incomeBottom - incomeTop;

  const rmdBottom = incomeTop;
  const rmdTop =
    grossRmd > 0
      ? Math.min(yScale(grossIncome + grossRmd), rmdBottom - MIN_SEGMENT_HEIGHT)
      : rmdBottom;
  const rmdHeight = rmdBottom - rmdTop;

  const convBottom = rmdTop;
  const convTop =
    grossConv > 0 ? Math.min(yScale(grossTotal), convBottom - MIN_SEGMENT_HEIGHT) : convBottom;
  const convHeight = convBottom - convTop;

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
      {/* Invisible hit area */}
      <rect x={x} y={0} width={barWidth} height={barBottom} fill="transparent" />

      {/* Remaining capacity boxes — one per gross bracket, drawn bottom-to-top */}
      {grossBrackets.map((b) => {
        if (b.min >= chartMax) return null;
        const filledInBracket = Math.max(0, Math.min(grossTotal, b.max) - b.min);
        const visibleMax = Math.min(b.max, chartMax);
        const remainingTop = yScale(visibleMax);
        const remainingBottom = yScale(b.min + filledInBracket);
        const remainingHeight = Math.max(remainingBottom - remainingTop, 0);
        if (remainingHeight <= 1) return null;
        return (
          <rect
            key={`rem-${b.rate}-${b.min}`}
            x={x}
            y={remainingTop}
            width={barWidth}
            height={remainingHeight}
            fill={CHART_COLORS.remaining}
            stroke={CHART_COLORS.remainingStroke}
            strokeWidth={0.5}
            rx={2}
          />
        );
      })}

      {/* Base income (bottom, blue) */}
      {incomeHeight > 0 && (
        <rect
          x={x}
          y={incomeTop}
          width={barWidth}
          height={incomeHeight}
          fill={CHART_COLORS.income}
          rx={2}
        />
      )}

      {/* RMD (above income, amber) */}
      {rmdHeight > 0 && (
        <rect x={x} y={rmdTop} width={barWidth} height={rmdHeight} fill={CHART_COLORS.rmd} rx={0} />
      )}

      {/* Conversion (top, gold) */}
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
}
