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
          style={{ fontFamily: "'Manrope', system-ui" }}
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

        {/* Optimal marker — beacon with light rays */}
        <div
          className="absolute top-[-18px] pointer-events-none"
          style={{
            left: `calc(8px + (100% - 16px) * ${optimalPercent / 100})`,
            transform: "translateX(-50%)",
            filter: "drop-shadow(0 0 6px rgba(240,198,116,0.6))",
          }}
          title={`Highest savings: ${formatCurrency(optimalValue)}`}
        >
          <svg width="20" height="22" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Light rays */}
            <line x1="10" y1="0" x2="10" y2="3" stroke="#F0C674" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
            <line x1="4" y1="2" x2="6" y2="4.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            <line x1="16" y1="2" x2="14" y2="4.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            {/* Flame */}
            <path d="M10 4C10 4 7 7.5 7 9.5C7 11.2 8.3 12.5 10 12.5C11.7 12.5 13 11.2 13 9.5C13 7.5 10 4 10 4Z" fill="#F0C674" />
            <path d="M10 6.5C10 6.5 8.5 8.5 8.5 9.5C8.5 10.3 9.2 11 10 11C10.8 11 11.5 10.3 11.5 9.5C11.5 8.5 10 6.5 10 6.5Z" fill="#FAF7F2" fillOpacity="0.7" />
            {/* Base */}
            <path d="M7 13h6l1 2H6l1-2z" fill="#E8A838" />
            {/* Stand */}
            <rect x="7" y="15" width="6" height="1.5" rx="0.5" fill="#E8A838" opacity="0.8" />
          </svg>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{formatCurrency(min)}</span>
        <span>{formatCurrency(max)}</span>
      </div>

      {/* Legend linking the beacon marker to its meaning */}
      <button
        type="button"
        onClick={() => onChange(optimalValue)}
        className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-accent transition-colors cursor-pointer mt-1 self-start text-left"
      >
        <svg width="14" height="15" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" style={{ filter: "drop-shadow(0 0 4px rgba(240,198,116,0.5))" }}>
          <line x1="10" y1="0" x2="10" y2="3" stroke="#F0C674" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
          <line x1="4" y1="2" x2="6" y2="4.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
          <line x1="16" y1="2" x2="14" y2="4.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
          <path d="M10 4C10 4 7 7.5 7 9.5C7 11.2 8.3 12.5 10 12.5C11.7 12.5 13 11.2 13 9.5C13 7.5 10 4 10 4Z" fill="#F0C674" />
          <path d="M10 6.5C10 6.5 8.5 8.5 8.5 9.5C8.5 10.3 9.2 11 10 11C10.8 11 11.5 10.3 11.5 9.5C11.5 8.5 10 6.5 10 6.5Z" fill="#FAF7F2" fillOpacity="0.7" />
          <path d="M7 13h6l1 2H6l1-2z" fill="#E8A838" />
          <rect x="7" y="15" width="6" height="1.5" rx="0.5" fill="#E8A838" opacity="0.8" />
        </svg>
        <span>Conversion amount with highest estimated lifetime savings</span>
      </button>
    </div>
  );
}
