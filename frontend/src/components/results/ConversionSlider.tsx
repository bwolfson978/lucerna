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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="metric-label">Conversion amount</span>
        <span
          className="text-h3 font-medium"
          style={{ fontFamily: "'Manrope', system-ui" }}
        >
          {formatCurrency(value)}
        </span>
      </div>

      <div className="relative mt-4">
        <input
          type="range"
          min={min}
          max={max}
          step={100}
          value={value}
          onChange={handleChange}
          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-slider"
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
          className="absolute top-[-18px] pointer-events-none optimal-marker"
          style={{
            left: `calc(8px + (100% - 16px) * ${optimalPercent / 100})`,
            transform: "translateX(-50%)",
          }}
          title={`Highest savings: ${formatCurrency(optimalValue)}`}
        >
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Diamond */}
            <path d="M7 0L12 6L7 12L2 6Z" fill="#F0C674" />
            <path d="M7 1.5L10.5 6L7 10.5L3.5 6Z" fill="#FAF7F2" fillOpacity="0.25" />
            {/* Stem */}
            <rect x="6" y="12" width="2" height="8" rx="1" fill="#F0C674" fillOpacity="0.6" />
          </svg>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{formatCurrency(min)}</span>
        <span>{formatCurrency(max)}</span>
      </div>

      {/* Legend linking the diamond marker to its meaning */}
      <button
        type="button"
        onClick={() => onChange(optimalValue)}
        className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-accent transition-colors cursor-pointer mt-1 self-start text-left"
      >
        <svg width="10" height="14" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" style={{ filter: "drop-shadow(0 0 3px rgba(240,198,116,0.4))" }}>
          <path d="M7 0L12 6L7 12L2 6Z" fill="#F0C674" />
          <rect x="6" y="12" width="2" height="8" rx="1" fill="#F0C674" fillOpacity="0.6" />
        </svg>
        <span>Conversion amount with highest estimated lifetime savings</span>
      </button>
    </div>
  );
}
