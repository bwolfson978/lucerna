"use client";

import { formatCurrency } from "@/lib/utils/formatting";
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
        <span className="metric-label">Total conversion amount</span>
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
            background: `linear-gradient(to right, #059669 0%, #059669 ${
              max > 0 ? ((value - min) / (max - min)) * 100 : 0
            }%, #E2E0DF ${
              max > 0 ? ((value - min) / (max - min)) * 100 : 0
            }%, #E2E0DF 100%)`,
          }}
        />

        {/* Optimal marker */}
        <div
          className="absolute top-[-6px] w-0 h-0 pointer-events-none"
          style={{
            left: `${optimalPercent}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="w-2.5 h-2.5 bg-accent rotate-45 border border-white shadow-sm"
            title={`Optimal: ${formatCurrency(optimalValue)}`}
          />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{formatCurrency(min)}</span>
        <span
          className="text-accent cursor-pointer hover:underline"
          onClick={() => onChange(optimalValue)}
        >
          Optimal: {formatCurrency(optimalValue)}
        </span>
        <span>{formatCurrency(max)}</span>
      </div>
    </div>
  );
}
