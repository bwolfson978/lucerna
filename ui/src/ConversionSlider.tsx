"use client";

import { formatAxisCurrency, formatCurrency } from "./format";
import { maybeSnap } from "./snap";

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
}

/** A position on the track that keeps the thumb's 22px circle inside it. The input is
 * 11px wider on each side, so its own 44px thumb lines up with the drawn one. */
const along = (fraction: number) => `calc(11px + (100% - 22px) * ${fraction})`;

/**
 * The total amount to convert, on a track that marks the most savings. Shared by the
 * result card (web chat, Claude, ChatGPT) and the full results page. A native range
 * input sits invisibly over the drawn track, so dragging, tapping, arrow keys and
 * screen readers all work as they do on any slider.
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
}: ConversionSliderProps) {
  const range = max - min;
  const fraction = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  const best = range > 0 ? Math.min(1, Math.max(0, (optimalValue - min) / range)) : 0;
  const atOptimal = value === optimalValue;
  // The "Most savings" tag centers on its tick, except near an end where it would
  // hang off the track.
  const tagShift = best < 0.15 ? "0%" : best > 0.85 ? "-100%" : "-50%";

  return (
    <div className="flex flex-col gap-2" data-ui="conversion-slider">
      <div className="flex min-h-[32px] flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-caption text-text-tertiary">
          Total converted:{" "}
          <span className="font-data text-text-primary text-[15px] font-semibold">
            {formatCurrency(value)}
          </span>
        </span>
        {atOptimal ? (
          <span className="bg-accent-light text-pine inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold">
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path d="M4 0 L8 4 L4 8 L0 4 Z" fill="currentColor" />
            </svg>
            Most savings
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onChange(optimalValue)}
            className="border-border bg-card text-pine hover:border-pine-mid inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
            Back to most savings
          </button>
        )}
      </div>

      <div className="relative h-[58px]">
        <span
          className="bg-pine-deep pointer-events-none absolute top-0 rounded-full px-[9px] py-[3px] text-[11px] font-semibold whitespace-nowrap text-[#f5f2ea]"
          style={{ left: along(best), transform: `translateX(${tagShift})` }}
          aria-hidden="true"
        >
          Most savings
        </span>
        <span
          className="bg-pine-deep pointer-events-none absolute top-[22px] h-[26px] w-[2px] -translate-x-1/2 rounded-full"
          style={{ left: along(best) }}
          aria-hidden="true"
        />
        <span className="bg-paper-deep pointer-events-none absolute inset-x-0 top-[32px] h-1.5 rounded-full" />
        <span
          className="bg-pine-mid pointer-events-none absolute top-[32px] left-0 h-1.5 rounded-full"
          style={{ width: along(fraction) }}
        />
        <span
          className={`border-pine-deep pointer-events-none absolute top-[24px] size-[22px] -translate-x-1/2 rounded-full border-2 shadow-[0_4px_10px_-4px_rgba(11,29,21,0.45)] ${atOptimal ? "bg-pine-mid" : "bg-card"}`}
          style={{ left: along(fraction) }}
          data-ui="slider-thumb"
        />
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
          className="range-overlay peer absolute top-[14px] -left-[11px] h-[44px] w-[calc(100%+22px)]"
        />
        <span className="ring-pine-mid/40 pointer-events-none absolute -inset-x-1 top-[18px] h-[34px] rounded-full opacity-0 ring-2 peer-focus-visible:opacity-100" />
      </div>

      <div className="text-text-tertiary -mt-1 flex justify-between font-mono text-[11px]">
        <span>{formatAxisCurrency(min)}</span>
        <span>{maxLabel ?? formatAxisCurrency(max)}</span>
      </div>
    </div>
  );
}
