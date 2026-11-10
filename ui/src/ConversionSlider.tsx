"use client";

import { PALETTE } from "./colors";
import { formatAxisCurrency, formatCurrency } from "./format";
import { maybeSnap } from "./snap";

/** One point of the savings curve: the savings at a total converted. */
export interface SliderSavingsPoint {
  total: number;
  savings: number;
}

interface ConversionSliderProps {
  value: number;
  min?: number;
  max: number;
  /** The total with the most savings, marked on the track and snapped to. */
  optimalValue: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Label at the right end of the track. Defaults to the maximum, e.g. "$900K". */
  maxLabel?: string;
  /** Savings at other totals. With them the track deepens to pine where savings are
   * highest; without, it is a plain track filled up to the thumb. */
  savings?: SliderSavingsPoint[];
}

const THUMB = 28;

/** A position on the track that keeps the thumb's circle inside it. The input is wider
 * by the difference to its own 44px thumb, so that thumb lines up with the drawn one. */
const along = (fraction: number) =>
  `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${Number(fraction.toFixed(4))})`;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const LOW = rgb(PALETTE.paperDeep);
const HIGH = rgb(PALETTE.pine);
/** Most gradient stops drawn, so a long curve stays a short style string. */
const MAX_STOPS = 48;
/** Above 1, so the colour gathers around the peak instead of washing the whole track. */
const FOCUS = 2.2;

/**
 * The track's background: paper where converting saves little, deepening to pine at
 * the total with the most savings. Null when there is nothing to show.
 */
export function savingsGlow(
  points: SliderSavingsPoint[] | undefined,
  min: number,
  max: number,
  optimalValue: number
): string | null {
  const range = max - min;
  if (!points || points.length < 2 || range <= 0) return null;
  const sorted = [...points].sort((a, b) => a.total - b.total);
  const most = Math.max(...sorted.map((p) => p.savings));
  if (most <= 0) return null;
  const every = Math.max(1, Math.ceil(sorted.length / MAX_STOPS));
  const stops = sorted
    .filter((_, i) => i % every === 0 || i === sorted.length - 1)
    .map((p) => ({ total: p.total, weight: Math.max(0, p.savings) / most }))
    // The darkest point is the marked total itself, whichever points were kept.
    .filter((p) => p.total !== optimalValue)
    .concat({ total: optimalValue, weight: 1 })
    .filter((p) => p.total >= min && p.total <= max)
    .sort((a, b) => a.total - b.total);
  const parts = stops.map((p) => {
    const w = Math.pow(p.weight, FOCUS);
    const colour = LOW.map((low, i) => Math.round(low + (HIGH[i] - low) * w));
    return `rgb(${colour.join(", ")}) ${along((p.total - min) / range)}`;
  });
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

const Diamond = ({ className }: { className?: string }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={className}>
    <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor" />
  </svg>
);

/**
 * The total amount to convert, on a track that glows where the savings are. Shared by
 * the result card (web chat, Claude, ChatGPT) and the full results page, which say
 * "Most savings" beside their headline (MostSavingsNote) with the same diamond that
 * marks the spot here. A native range input sits invisibly over the drawn track, so
 * dragging, tapping, arrow keys and screen readers all work as they do on any slider.
 */
export function ConversionSlider({
  value,
  min = 0,
  max,
  optimalValue,
  onChange,
  onDragStart,
  onDragEnd,
  maxLabel,
  savings,
}: ConversionSliderProps) {
  const range = max - min;
  const fraction = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  const best = range > 0 ? Math.min(1, Math.max(0, (optimalValue - min) / range)) : 0;
  const atOptimal = value === optimalValue;
  const glow = savingsGlow(savings, min, max, optimalValue);

  return (
    <div className="flex flex-col gap-1.5" data-ui="conversion-slider">
      <div className="relative h-[44px]">
        <span
          className="bg-paper-deep pointer-events-none absolute inset-x-0 top-[15px] h-3.5 rounded-full"
          style={glow ? { background: glow } : undefined}
          data-ui="slider-track"
          data-glow={glow ? "" : undefined}
        />
        {!glow && (
          <span
            className="bg-pine-mid pointer-events-none absolute top-[15px] left-0 h-3.5 rounded-full"
            style={{ width: along(fraction) }}
          />
        )}
        <span
          className="pointer-events-none absolute top-[17px] -translate-x-1/2 text-[#f5f2ea]"
          style={{ left: along(best) }}
          data-ui="slider-mark"
        >
          <Diamond />
        </span>
        <span
          className="border-pine-deep bg-card text-pine pointer-events-none absolute top-[8px] flex size-[28px] -translate-x-1/2 items-center justify-center rounded-full border-2 shadow-[0_6px_14px_-4px_rgba(11,29,21,0.45)]"
          style={{ left: along(fraction) }}
          data-ui="slider-thumb"
        >
          {atOptimal && <Diamond />}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={value}
          aria-label="Total amount to convert"
          aria-valuetext={`${formatCurrency(value)}${atOptimal ? ", most savings" : ""}`}
          onChange={(e) => onChange(maybeSnap(Number(e.target.value), optimalValue, min, max))}
          onPointerDown={onDragStart}
          onPointerUp={onDragEnd}
          onBlur={onDragEnd}
          className="range-overlay peer absolute top-0 -left-[8px] h-[44px] w-[calc(100%+16px)]"
        />
        <span className="ring-pine-mid/40 pointer-events-none absolute -inset-x-1 top-[5px] h-[34px] rounded-full opacity-0 ring-2 peer-focus-visible:opacity-100" />
      </div>

      <div className="text-text-tertiary flex justify-between font-mono text-[11px]">
        <span>{formatAxisCurrency(min)}</span>
        <span>{maxLabel ?? formatAxisCurrency(max)}</span>
      </div>
    </div>
  );
}
