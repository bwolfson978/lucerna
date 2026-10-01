"use client";

/**
 * Compact charts for the conversation. Every value comes from an engine result.
 * Bars grow in when scrolled into view (static under reduced motion), every mark
 * has a hover/focus tooltip, and stacked segments are separated by a 2px gap.
 */

import { useState, type ReactNode } from "react";
import type { BracketFillResult, OptimizationResult } from "@/lib/types";
import { BRACKET_COLORS, CHART_COLORS, PALETTE } from "@/lib/utils/constants";
import { formatAxisCurrency, formatCurrency } from "@/lib/utils/formatting";
import { useInView, usePrefersReducedMotion } from "@/hooks/useInView";

const W = 600;
const GAP = 2;

function bracketColor(rate: number): string {
  return BRACKET_COLORS[rate.toFixed(2)] ?? CHART_COLORS.conversion;
}

function rateLabel(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function labelEvery(count: number): number {
  if (count <= 10) return 1;
  if (count <= 20) return 2;
  return 5;
}

interface TooltipState {
  x: number; // percent of chart width
  lines: { label: string; value: string; color?: string }[];
  title: string;
}

function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 18), 82);
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-[12px] bg-pine-deep px-3 py-2 text-[12px] text-[#f5f2ea] shadow-lg"
      style={{ left: `${left}%` }}
    >
      <div className="font-mono text-[11px] text-pine-haze">{tip.title}</div>
      {tip.lines.map((line) => (
        <div key={line.label} className="flex items-center gap-2 whitespace-nowrap">
          {line.color && (
            <span className="h-[2px] w-3 rounded" style={{ background: line.color }} />
          )}
          <span className="font-data font-semibold">{line.value}</span>
          <span className="text-pine-haze">{line.label}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={item.line ? "h-[2px] w-4 rounded" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function useGrow() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const reduced = usePrefersReducedMotion();
  return { ref, grown: inView || reduced, animate: !reduced };
}

function ChartFrame({
  title,
  legend,
  children,
  tip,
  footer,
  frameRef,
}: {
  title: string;
  legend?: ReactNode;
  children: ReactNode;
  tip: TooltipState | null;
  footer?: ReactNode;
  frameRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={frameRef} className="card flex flex-col gap-3">
      <h3 className="text-h3 text-text-primary">{title}</h3>
      {legend}
      <div className="relative">
        {children}
        <ChartTooltip tip={tip} />
      </div>
      {footer}
    </div>
  );
}

// --------------------------------------------------------------------------
// How conversions fill the brackets, year by year
// --------------------------------------------------------------------------

interface YearStack {
  year: number;
  income: number;
  conversion: number;
  segments: { rate: number; amount: number }[];
  topRate: number | null;
}

function yearStacks(result: OptimizationResult): YearStack[] {
  return result.input.timeline.map((y, i) => {
    const fill: BracketFillResult[] = result.yearly_bracket_fill[i] ?? [];
    const income = fill.reduce((s, b) => s + b.filled_by_income, 0);
    const segments = fill
      .filter((b) => b.filled_by_conversion > 0.5)
      .map((b) => ({ rate: b.bracket_rate, amount: b.filled_by_conversion }));
    return {
      year: y.year,
      income,
      conversion: result.yearly_conversions[i] ?? 0,
      segments,
      topRate: segments.length ? segments[segments.length - 1].rate : null,
    };
  });
}

export function BracketScheduleChart({ result }: { result: OptimizationResult }) {
  const { ref, grown, animate } = useGrow();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const stacks = yearStacks(result);
  const H = 210;
  const top = 12;
  const bottom = 26;
  const left = 44;
  const plotW = W - left - 8;
  const max = Math.max(
    1,
    ...stacks.map((s) => s.income + s.segments.reduce((a, b) => a + b.amount, 0))
  );
  const y = (v: number) => ((H - top - bottom) * v) / max;
  const slot = plotW / stacks.length;
  const barW = Math.max(6, Math.min(30, slot - 6));
  const every = labelEvery(stacks.length);
  const ticks = [0, max / 2, max];
  const usedRates = Array.from(
    new Set(stacks.flatMap((s) => s.segments.map((g) => g.rate)))
  ).sort();

  return (
    <ChartFrame
      frameRef={ref}
      title="How conversions fill your tax brackets"
      tip={tip}
      legend={
        <Legend
          items={[
            { label: "Other taxable income", color: CHART_COLORS.income },
            ...usedRates.map((r) => ({
              label: `Converted at ${rateLabel(r)}`,
              color: bracketColor(r),
            })),
          ]}
        />
      }
      footer={
        <p className="text-caption text-text-tertiary">
          Taxable income each year after the standard deduction. Conversions stop where the next
          bracket would cost more than it saves.
        </p>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Taxable income and conversions by year, colored by tax bracket"
        onPointerLeave={() => setTip(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={W - 8}
              y1={H - bottom - y(t)}
              y2={H - bottom - y(t)}
              stroke="rgba(20,20,20,0.06)"
            />
            <text
              x={left - 6}
              y={H - bottom - y(t) + 4}
              textAnchor="end"
              className="fill-text-tertiary font-ui text-[11px]"
            >
              {formatAxisCurrency(t)}
            </text>
          </g>
        ))}
        {stacks.map((s, i) => {
          const x = left + slot * i + (slot - barW) / 2;
          let base = H - bottom;
          const parts = [
            {
              key: "income",
              amount: s.income,
              color: CHART_COLORS.income,
              rate: null as number | null,
            },
            ...s.segments.map((g) => ({
              key: `r${g.rate}`,
              amount: g.amount,
              color: bracketColor(g.rate),
              rate: g.rate,
            })),
          ].filter((p) => p.amount > 0.5);
          const show = () =>
            setTip({
              x: ((x + barW / 2) / W) * 100,
              title: String(s.year),
              lines: [
                {
                  label: "converted",
                  value: formatCurrency(s.conversion),
                  color: CHART_COLORS.conversion,
                },
                {
                  label: "other taxable income",
                  value: formatCurrency(s.income),
                  color: CHART_COLORS.income,
                },
                ...(s.topRate != null
                  ? [{ label: "top bracket used", value: rateLabel(s.topRate) }]
                  : []),
              ],
            });
          return (
            <g
              key={s.year}
              tabIndex={0}
              role="img"
              aria-label={`${s.year}: converted ${formatCurrency(s.conversion)}`}
              onPointerEnter={show}
              onPointerMove={show}
              onFocus={show}
              onBlur={() => setTip(null)}
              className="outline-none"
            >
              <rect
                x={left + slot * i}
                y={top}
                width={slot}
                height={H - top - bottom}
                fill="transparent"
              />
              <g
                style={{
                  transform: grown ? "scaleY(1)" : "scaleY(0)",
                  transformOrigin: `0 ${H - bottom}px`,
                  transition: animate
                    ? `transform 600ms cubic-bezier(0.2,0.7,0.2,1) ${i * 35}ms`
                    : undefined,
                }}
              >
                {parts.map((p, j) => {
                  const h = Math.max(1, y(p.amount) - (j > 0 ? GAP : 0));
                  base -= y(p.amount);
                  const isTop = j === parts.length - 1;
                  return (
                    <rect
                      key={p.key}
                      x={x}
                      y={base}
                      width={barW}
                      height={h}
                      rx={isTop ? 3 : 0}
                      fill={p.color}
                      opacity={p.rate == null ? 0.75 : 1}
                    />
                  );
                })}
              </g>
              {i % every === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-text-tertiary font-mono text-[11px]"
                >
                  {s.year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

// --------------------------------------------------------------------------
// What-if: conversions by year, current vs. what-if
// --------------------------------------------------------------------------

export function CompareBars({
  base,
  variant,
  variantLabel,
}: {
  base: OptimizationResult;
  variant: OptimizationResult;
  variantLabel: string;
}) {
  const { ref, grown, animate } = useGrow();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const byYear = (r: OptimizationResult) =>
    new Map(r.input.timeline.map((t, i) => [t.year, r.yearly_conversions[i] ?? 0]));
  const a = byYear(base);
  const b = byYear(variant);
  const years = Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => x - y);
  const max = Math.max(1, ...years.map((yr) => Math.max(a.get(yr) ?? 0, b.get(yr) ?? 0)));
  const H = 90;
  const slot = W / years.length;
  const pairW = Math.max(6, Math.min(36, slot - 6));
  const barW = (pairW - GAP) / 2;
  const every = labelEvery(years.length);
  const colors = { base: CHART_COLORS.income, variant: CHART_COLORS.conversion };

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Legend
        items={[
          { label: "Your scenario", color: colors.base },
          { label: variantLabel, color: colors.variant },
        ]}
      />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H + 18}`}
          className="w-full"
          role="img"
          aria-label="Conversions by year, your scenario compared with the what-if"
          onPointerLeave={() => setTip(null)}
        >
          <line x1={0} x2={W} y1={H} y2={H} stroke={PALETTE.line} />
          {years.map((yr, i) => {
            const x = slot * i + (slot - pairW) / 2;
            const show = () =>
              setTip({
                x: ((x + pairW / 2) / W) * 100,
                title: String(yr),
                lines: [
                  {
                    label: variantLabel,
                    value: formatCurrency(b.get(yr) ?? 0),
                    color: colors.variant,
                  },
                  {
                    label: "your scenario",
                    value: formatCurrency(a.get(yr) ?? 0),
                    color: colors.base,
                  },
                ],
              });
            return (
              <g
                key={yr}
                tabIndex={0}
                role="img"
                aria-label={`${yr}: ${formatCurrency(a.get(yr) ?? 0)} now, ${formatCurrency(b.get(yr) ?? 0)} in the what-if`}
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
                className="outline-none"
              >
                <rect x={slot * i} y={0} width={slot} height={H} fill="transparent" />
                {[
                  { v: a.get(yr) ?? 0, dx: 0, color: colors.base },
                  { v: b.get(yr) ?? 0, dx: barW + GAP, color: colors.variant },
                ].map((bar) => {
                  const h = Math.max(bar.v > 0 ? 2 : 0, (H - 4) * (bar.v / max));
                  return (
                    <rect
                      key={bar.dx}
                      x={x + bar.dx}
                      y={H - h}
                      width={barW}
                      height={h}
                      rx={2}
                      fill={bar.color}
                      style={{
                        transform: grown ? "scaleY(1)" : "scaleY(0)",
                        transformOrigin: `0 ${H}px`,
                        transition: animate ? `transform 500ms ease ${i * 25}ms` : undefined,
                      }}
                    />
                  );
                })}
                {i % every === 0 && (
                  <text
                    x={x + pairW / 2}
                    y={H + 15}
                    textAnchor="middle"
                    className="fill-text-tertiary font-mono text-[11px]"
                  >
                    {yr}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <ChartTooltip tip={tip} />
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Traditional balance over time, with vs. without conversions
// --------------------------------------------------------------------------

export function BalanceLines({ result }: { result: OptimizationResult }) {
  const { ref, grown, animate } = useGrow();
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const withConv = result.rmd_projection?.yearly_detail ?? [];
  const without = result.rmd_projection_no_conversion?.yearly_detail ?? [];
  if (withConv.length < 2 || without.length < 2) return null;

  const ages = withConv.map((d) => d.age);
  const withoutByAge = new Map(without.map((d) => [d.age, d.trad_balance_start]));
  const points = withConv.map((d) => ({
    age: d.age,
    year: d.year,
    with: d.trad_balance_start,
    without: withoutByAge.get(d.age) ?? 0,
  }));
  const H = 180;
  const left = 50;
  const bottom = 24;
  const plotW = W - left - 10;
  const max = Math.max(1, ...points.map((p) => Math.max(p.with, p.without)));
  const x = (i: number) => left + (plotW * i) / (points.length - 1);
  const y = (v: number) => H - bottom - ((H - bottom - 10) * v) / max;
  const path = (key: "with" | "without") =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)
      .join(" ");
  const every = Math.max(1, Math.ceil(points.length / 6));
  const colors = { with: CHART_COLORS.conversion, without: PALETTE.muted };

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - left) / plotW) * (points.length - 1));
    const idx = Math.min(points.length - 1, Math.max(0, i));
    const p = points[idx];
    setHover(idx);
    setTip({
      x: (x(idx) / W) * 100,
      title: `Age ${p.age} (${p.year})`,
      lines: [
        { label: "with conversions", value: formatCurrency(p.with), color: colors.with },
        { label: "without", value: formatCurrency(p.without), color: colors.without },
      ],
    });
  }

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <Legend
        items={[
          { label: "With conversions", color: colors.with, line: true },
          { label: "Without conversions", color: colors.without, line: true },
        ]}
      />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-pan-y"
          role="img"
          aria-label={`Traditional balance from age ${ages[0]} to ${ages[ages.length - 1]}, with and without conversions`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => {
            setHover(null);
            setTip(null);
          }}
        >
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={left} x2={W - 10} y1={y(t)} y2={y(t)} stroke="rgba(20,20,20,0.06)" />
              <text
                x={left - 6}
                y={y(t) + 4}
                textAnchor="end"
                className="fill-text-tertiary font-ui text-[11px]"
              >
                {formatAxisCurrency(t)}
              </text>
            </g>
          ))}
          {(["without", "with"] as const).map((key) => (
            <path
              key={key}
              d={path(key)}
              fill="none"
              stroke={colors[key]}
              strokeWidth={2}
              {...(key === "with"
                ? {
                    pathLength: 1,
                    style: {
                      strokeDasharray: 1,
                      strokeDashoffset: grown ? 0 : 1,
                      transition: animate
                        ? "stroke-dashoffset 900ms cubic-bezier(0.2,0.7,0.2,1)"
                        : undefined,
                    },
                  }
                : { strokeDasharray: "5 4" })}
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={8} y2={H - bottom} stroke={PALETTE.stone} />
              <circle
                cx={x(hover)}
                cy={y(points[hover].with)}
                r={4}
                fill={colors.with}
                stroke="#fff"
                strokeWidth={2}
              />
              <circle
                cx={x(hover)}
                cy={y(points[hover].without)}
                r={4}
                fill={colors.without}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          )}
          {points.map((p, i) =>
            i % every === 0 ? (
              <text
                key={p.age}
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-text-tertiary font-mono text-[11px]"
              >
                {p.age}
              </text>
            ) : null
          )}
        </svg>
        <ChartTooltip tip={tip} />
      </div>
    </div>
  );
}
