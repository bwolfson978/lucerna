"use client";

import { formatCurrency } from "@/lib/utils/formatting";
import { CHART_COLORS } from "@/lib/utils/constants";
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
      onChange(Number(e.target.value));
    },
    [onChange]
  );

  const optimalPercent =
    max > 0 ? ((optimalValue - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="metric-label">Conversion amount</span>
        <span
          className="text-h3 font-medium"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {formatCurrency(value)}
        </span>
      </div>

      <div className="relative">
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

        {/* Optimal marker — offset to match range thumb positioning.
            Range thumbs don't reach container edges; the center sits
            8px (half thumb width) inward at min/max.  */}
        <div
          className="absolute top-[-6px] w-0 h-0 pointer-events-none"
          style={{
            left: `calc(8px + (100% - 16px) * ${optimalPercent / 100})`,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="w-2.5 h-2.5 bg-accent rotate-45 border border-white shadow-sm"
            title={`Highest savings: ${formatCurrency(optimalValue)}`}
          />
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
        className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-accent transition-colors cursor-pointer mt-1"
      >
        <span className="inline-block w-2 h-2 bg-accent rotate-45 border border-white shadow-sm flex-shrink-0" />
        <span>Conversion amount with highest estimated lifetime savings</span>
      </button>
    </div>
  );
}
