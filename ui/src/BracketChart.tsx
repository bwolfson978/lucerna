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
import { cn } from "./cn";
import { ScrollTrack, usePrefersReducedMotion } from "./charts/primitives";

/**
 * The tax bracket chart: everything taxed in a year (income, withdrawals from the
 * traditional account, the taxable part of Social Security and the Roth conversion)
 * stacked against the federal brackets, with the space left in each bracket. One
 * component for the results page, the conversation's result card and the MCP App View.
 * Plain data in; the brackets and standard deduction come from the caller.
 *
 * The axis is income counted for tax: the standard deduction is the 0% band at the
 * bottom and each bracket line sits at the deduction plus the bracket's top. A bar
 * therefore ends at the year's taxable income plus the standard deduction.
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
  /** Income from outside the accounts (wages, pensions), without Social Security. */
  income?: number;
  rmdAmount?: number;
  /** Traditional withdrawal that funds spending, beyond the required one. */
  withdrawal?: number;
  /** The part of Social Security that is taxed. It grows with the year's other income,
   * the conversion included. */
  socialSecurity?: number;
  conversion?: number;
  /** Deductions at 65 and over on top of the standard one. They come off the bottom of
   * the bar, so the bracket lines stay where they are in every year. */
  extraDeduction?: number;
}

/** A bar's stacked parts, bottom to top. Social Security sits right under the
 * conversion, so the two rise together when converting more makes more of it taxable. */
const SEGMENTS = [
  { key: "income", label: "Other income", color: CHART_COLORS.income },
  { key: "rmdAmount", label: "Required withdrawal", color: CHART_COLORS.rmd },
  {
    key: "withdrawal",
    label: "Withdrawals for spending",
    color: CHART_COLORS.withdrawal,
  },
  {
    key: "socialSecurity",
    label: "Taxable Social Security",
    color: CHART_COLORS.socialSecurity,
  },
  {
    key: "conversion",
    label: "Roth conversion",
    color: CHART_COLORS.conversion,
  },
] as const satisfies readonly {
  key: keyof BracketChartYear;
  label: string;
  color: string;
}[];

/** Where a year's bar ends: everything stacked in it, less the 65+ deductions. */
export function barTop(year: BracketChartYear): number {
  const stacked = SEGMENTS.reduce((sum, s) => sum + (year[s.key] ?? 0), 0);
  return Math.max(0, stacked - (year.extraDeduction ?? 0));
}

export interface BracketLegendItem {
  color: string;
  label: string;
  /** Drawn as an outlined swatch (the room left in a bracket). */
  outline?: boolean;
}

/** The legend for these years: the conversion always, each other part when a year has
 * it. One list for the chart's own legend and the results page's. */
export function bracketLegend(years: BracketChartYear[]): BracketLegendItem[] {
  return [
    ...SEGMENTS.filter((s) => s.key === "conversion" || years.some((y) => (y[s.key] ?? 0) > 0)).map(
      ({ label, color }) => ({ label, color })
    ),
    { color: "", label: "Room left in bracket", outline: true },
  ];
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

/** What each part is called in the tooltip, where there is room to say more. */
const TOOLTIP_LABELS: Record<(typeof SEGMENTS)[number]["key"], string> = {
  income: "Other income",
  rmdAmount: "Required withdrawal",
  withdrawal: "Withdrawal for spending",
  socialSecurity: "Social Security, taxable part",
  conversion: "Conversion",
};

const DATA_FONT_FAMILY = "'Inter', system-ui";
const dataFontStyle = {
  fontFamily: DATA_FONT_FAMILY,
  fontVariantNumeric: "tabular-nums",
} as const;

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
   * The tallest bar (see barTop) pre-computed from the
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
  raw: TaxBracket[] | undefined,
  deduction: number
): { rate: number; min: number; max: number }[] {
  const result: { rate: number; min: number; max: number }[] = [
    { rate: 0, min: 0, max: deduction },
  ];
  for (const b of raw ?? []) {
    const taxableMax = b.max === null ? b.min + 500000 : b.max;
    result.push({
      rate: b.rate,
      min: deduction + b.min,
      max: deduction + taxableMax,
    });
  }
  return result;
}

export const BAR_GAP = 10;
export const MIN_BAR_WIDTH = 24;
export const DEFAULT_BAR_WIDTH = 48;
// Phones get tighter bars so a typical plan (up to about nine years) fits without scrolling.
const BAR_GAP_MOBILE = 6;
const MIN_BAR_WIDTH_MOBILE = 16;
/** With values under the bars, phone columns stay wide enough for "193K" (the chart scrolls instead). */
const MIN_BAR_WIDTH_MOBILE_WITH_VALUES = 28;
/** Below this column width, years print as '26. */
const SHORT_YEAR_COL_WIDTH = 34;
/** Below this column width, values under the bars drop the $ ("126K") so neighbors don't touch. */
const COMPACT_VALUE_COL_WIDTH = 46;
const MIN_DESKTOP_CHART_HEIGHT = 320;
const MAX_DESKTOP_CHART_HEIGHT = 480;
const MOBILE_CHART_HEIGHT = 260;
const TOP_PADDING = 16;
const BOTTOM_PADDING = 40;
/** Minimum pixel height so small-but-nonzero segments stay visible */
const MIN_SEGMENT_HEIGHT = 3;
const MOBILE_BREAKPOINT = 500;
const LEFT_AXIS_WIDTH_DESKTOP = 70;
const LEFT_AXIS_WIDTH_MOBILE = 56;
const RIGHT_AXIS_WIDTH_DESKTOP = 96;
const RIGHT_AXIS_WIDTH_MOBILE = 36;

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
  const prefersReducedMotion = usePrefersReducedMotion();

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

  const showValues = addedTax != null;

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
    const gap = isMobile ? BAR_GAP_MOBILE : BAR_GAP;
    const minBarWidth = !isMobile
      ? MIN_BAR_WIDTH
      : showValues
        ? MIN_BAR_WIDTH_MOBILE_WITH_VALUES
        : MIN_BAR_WIDTH_MOBILE;
    const totalOverhead = leftAxisWidth + rightAxisWidth;

    let barWidth = DEFAULT_BAR_WIDTH;
    let barsFit = true;

    if (containerWidth !== undefined && years.length > 0) {
      const availableForBars = containerWidth - totalOverhead;
      const computed = Math.floor((availableForBars - gap) / years.length) - gap;
      if (computed >= minBarWidth) {
        // Let bars expand to fill available space — no hard cap
        barWidth = computed;
        barsFit = true;
      } else {
        barWidth = minBarWidth;
        barsFit = false;
      }
    }

    const totalBarWidth = years.length > 0 ? years.length * (barWidth + gap) - gap : 0;

    return {
      isMobile,
      chartHeight,
      leftAxisWidth,
      rightAxisWidth,
      gap,
      barWidth,
      totalBarWidth,
      barsFit,
    };
  }, [containerWidth, viewportHeight, fixedHeight, years.length, showValues]);

  const {
    isMobile,
    chartHeight,
    leftAxisWidth,
    rightAxisWidth,
    gap,
    barWidth,
    totalBarWidth,
    barsFit,
  } = layout;
  const colWidth = barWidth + gap;
  // Years past the right edge before any scrolling, for the scroll hint.
  const visibleCols =
    containerWidth !== undefined
      ? Math.max(1, Math.floor((containerWidth - leftAxisWidth - rightAxisWidth) / colWidth))
      : years.length;
  const hiddenYears = barsFit ? 0 : Math.max(0, years.length - visibleCols);
  const shortYears = colWidth < SHORT_YEAR_COL_WIDTH;
  const compactValues = colWidth < COMPACT_VALUE_COL_WIDTH;

  // Notify parent of bar slot width for table column alignment
  useEffect(() => {
    onBarWidthChange?.(colWidth);
  }, [colWidth, onBarWidthChange]);

  // Notify parent of fixed-area dimensions so the table can match
  useEffect(() => {
    onLayoutChange?.({
      leftOffset: leftAxisWidth,
      rightOffset: rightAxisWidth,
      verticalLabelWidth: 0,
      // Left edge of right-aligned axis labels (textAnchor="end" at leftAxisWidth - 6).
      // Approximate label width ~30px for "$250K" style text at small size.
      axisLabelStart: Math.round(leftAxisWidth * 0.4),
    });
  }, [onLayoutChange, leftAxisWidth, rightAxisWidth]);

  // Under the bars: what to convert each year (the answer), then the tax it adds.
  const rows = showValues
    ? [
        {
          label: "Convert",
          values: years.map((y) => y.conversion ?? 0),
          strong: true,
        },
        { label: "Tax", values: addedTax, strong: false },
      ]
    : [];

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
        ...yearData,
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

  const legend = useMemo(() => bracketLegend(years), [years]);

  // The tallest bar across all years drives the chart scale.
  // When stableMaxGrossAmount is provided (pre-computed from the full conversion curve),
  // use it directly so the Y-axis does not rescale as the slider moves.
  const maxGrossAmount = useMemo(() => {
    const base =
      stableMaxGrossAmount !== undefined
        ? stableMaxGrossAmount
        : (() => {
            let max = 0;
            for (const y of years) {
              const gross = barTop(y);
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
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "h-3 w-3 rounded",
                  item.outline && "border-border bg-bg-hover border"
                )}
                style={item.outline ? undefined : { backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
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
          {rows.map((row) => (
            <div
              key={row.label}
              className="text-text-tertiary flex h-7 items-center justify-end pr-1.5 text-[12px] font-medium"
            >
              {row.label}
            </div>
          ))}
        </div>

        {/* Scrollable bar area */}
        <div
          ref={fadeRef}
          className={`min-w-0 flex-1 ${!barsFit ? "scroll-fade scroll-fade-wide mb-2" : ""}`}
        >
          {/* Scroll hint: says how many years are off to the right, nudges toward them, and
              scrolls one screen on click. Stays until the first scroll. */}
          {!barsFit && !hasScrolled && hiddenYears > 0 && (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center pr-2">
              <button
                type="button"
                onClick={() =>
                  scrollRef.current?.scrollBy({
                    left: scrollRef.current.clientWidth * 0.8,
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                  })
                }
                className="bg-pine-deep shadow-elevated pointer-events-auto flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-3 text-[12px] font-medium text-[#f5f2ea]"
                aria-label={`Scroll to see ${hiddenYears} more ${hiddenYears === 1 ? "year" : "years"}`}
              >
                <span>
                  {hiddenYears} more {hiddenYears === 1 ? "year" : "years"}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                  className="scroll-hint-nudge"
                >
                  <path
                    d="M4.5 2.5L8 6L4.5 9.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
          <div
            ref={scrollRef}
            className={
              !barsFit ? "bracket-chart-scroll scroll-native-hidden overflow-x-auto pb-2" : ""
            }
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
                    const maskX = i * colWidth;
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
                  const x = i * colWidth;
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
                  const x = i * colWidth + barWidth / 2;
                  return (
                    <text
                      key={`label-${yearData.year}`}
                      x={x}
                      y={chartHeight - 6}
                      textAnchor="middle"
                      className={`${barWidth < 36 ? "text-[11px]" : "text-data-xs"} fill-text-tertiary`}
                      fontFamily={DATA_FONT_FAMILY}
                    >
                      {shortYears ? `\u2019${String(yearData.year).slice(-2)}` : yearData.year}
                    </text>
                  );
                })}
              </svg>
              {rows.map((row) => (
                <div key={row.label} className="flex" data-ui={`row-${row.label.toLowerCase()}`}>
                  {years.map((yearData, i) => {
                    const maxChars = Math.max(4, Math.floor((colWidth - 8) / 6.5));
                    const value = row.values[i];
                    const text = value != null ? formatTableCurrency(value, maxChars) : "-";
                    return (
                      <div
                        key={yearData.year}
                        data-value={value ?? undefined}
                        className={cn(
                          "flex h-7 items-center justify-center whitespace-nowrap",
                          compactValues ? "text-[11px] tracking-[-0.02em]" : "text-data-xs",
                          !value
                            ? "text-text-tertiary font-normal"
                            : row.strong
                              ? "text-text-primary font-semibold"
                              : "text-text-tertiary font-medium"
                        )}
                        // Each value centers on its bar (bars start at the slot's left edge).
                        style={{
                          width: barWidth,
                          minWidth: barWidth,
                          marginRight: gap,
                          ...dataFontStyle,
                        }}
                      >
                        {compactValues ? text.replace("$", "") : text}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {!barsFit && <ScrollTrack scrollRef={scrollRef} />}
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
              <div className="flex flex-col gap-1.5">
                {SEGMENTS.map((segment) => {
                  const amount = tooltip[segment.key] ?? 0;
                  if (amount <= 0) return null;
                  return (
                    <div key={segment.key} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: segment.color }}
                        />
                        <span className="text-text-secondary">{TOOLTIP_LABELS[segment.key]}</span>
                      </span>
                      <span className="text-text-primary font-medium">
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
                {(tooltip.extraDeduction ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-text-secondary pl-3.5">Extra deduction at 65+</span>
                    <span className="text-text-primary font-medium">
                      {`-${formatCurrency(tooltip.extraDeduction ?? 0)}`}
                    </span>
                  </div>
                )}
                <div className="border-glass-border text-caption text-text-primary mt-1 flex justify-between gap-4 border-t pt-1.5 font-medium">
                  <span>Counted for tax</span>
                  <span>{formatCurrency(barTop(tooltip))}</span>
                </div>
              </div>
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

  // The solid segments, bottom to top. The 65+ deductions come off the bottom first, so
  // the top of the bar is where the brackets apply. A small amount still gets a few
  // pixels, so it can be seen.
  let trim = yearData.extraDeduction ?? 0;
  let stacked = 0;
  let top = yScale(0);
  const segments = SEGMENTS.flatMap((segment) => {
    const amount = yearData[segment.key] ?? 0;
    const shown = Math.max(0, amount - trim);
    trim = Math.max(0, trim - amount);
    if (shown <= 0) return [];
    stacked += shown;
    const bottom = top;
    top = Math.min(yScale(stacked), bottom - MIN_SEGMENT_HEIGHT);
    return [{ ...segment, y: top, height: bottom - top }];
  });
  const grossTotal = stacked;

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

      {segments.map((segment, i) => (
        <rect
          key={segment.key}
          data-segment={segment.key}
          x={x}
          y={segment.y}
          width={barWidth}
          height={segment.height}
          fill={segment.color}
          // The ends of the bar are rounded; the joins between its parts are square
          rx={i === 0 || i === segments.length - 1 ? 2 : 0}
        />
      ))}
    </g>
  );
}
