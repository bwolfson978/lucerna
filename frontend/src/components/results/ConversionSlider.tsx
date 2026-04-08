"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import { CHART_COLORS } from "@/lib/utils/constants";
import { maybeSnap } from "@/lib/utils/snap";
import { useCallback } from "react";

interface ConversionSliderProps {
  value: number;
  min: number;
  max: number;
  optimalValue: number;
  onChange: (value: number) => void;
}

export function ConversionSlider({
  value,
  min,
  max,
  optimalValue,
  onChange,
}: ConversionSliderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      onChange(maybeSnap(raw, optimalValue, min, max));
    },
    [onChange, optimalValue, min, max]
  );

  const optimalPercent =
    max > 0
      ? Math.min(100, Math.max(0, ((optimalValue - min) / (max - min)) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-1">
      {/* Value + label row */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-data-xs text-text-tertiary whitespace-nowrap">Conversion amount</span>
        <span
          className="text-body-sm font-medium text-text-primary tabular-nums"
          style={{ fontFamily: "'Manrope', system-ui" }}
        >
          {formatCurrency(value)}
        </span>
      </div>

      {/* Slider track with optimal marker */}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={value}
          onChange={handleChange}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-slider"
          style={{
            background: `linear-gradient(to right, ${CHART_COLORS.conversion} 0%, ${CHART_COLORS.conversion} ${
              max > 0 ? ((value - min) / (max - min)) * 100 : 0
            }%, ${CHART_COLORS.sliderTrack} ${
              max > 0 ? ((value - min) / (max - min)) * 100 : 0
            }%, ${CHART_COLORS.sliderTrack} 100%)`,
          }}
        />

        {/* Optimal marker — gold diamond with stem */}
        <div
          className="absolute top-[-12px] pointer-events-none optimal-marker"
          style={{
            left: `calc(8px + (100% - 16px) * ${optimalPercent / 100})`,
            transform: "translateX(-50%)",
          }}
          title={`Highest savings: ${formatCurrency(optimalValue)}`}
        >
          <svg width="8" height="14" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 0L12 6L7 12L2 6Z" fill="#F0C674" />
            <path d="M7 1.5L10.5 6L7 10.5L3.5 6Z" fill="#FAF7F2" fillOpacity="0.25" />
            <rect x="6" y="12" width="2" height="8" rx="1" fill="#F0C674" fillOpacity="0.6" />
          </svg>
        </div>
      </div>

      {/* Diamond legend — clickable reset to optimal */}
      <button
        type="button"
        onClick={() => onChange(optimalValue)}
        className="flex items-center gap-1 text-data-xs text-text-tertiary hover:text-accent transition-colors cursor-pointer self-start text-left"
      >
        <svg width="8" height="11" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" style={{ filter: "drop-shadow(0 0 3px rgba(240,198,116,0.4))" }}>
          <path d="M7 0L12 6L7 12L2 6Z" fill="#F0C674" />
          <rect x="6" y="12" width="2" height="8" rx="1" fill="#F0C674" fillOpacity="0.6" />
        </svg>
        <span>Highest savings</span>
      </button>
    </div>
  );
}
