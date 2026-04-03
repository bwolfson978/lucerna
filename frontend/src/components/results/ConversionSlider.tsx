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

        {/* Optimal marker — lighthouse icon with rotating light */}
        <div
          className="absolute top-[-22px] pointer-events-none"
          style={{
            left: `calc(8px + (100% - 16px) * ${optimalPercent / 100})`,
            transform: "translateX(-50%)",
            filter: "drop-shadow(0 0 5px rgba(240,198,116,0.5))",
          }}
          title={`Highest savings: ${formatCurrency(optimalValue)}`}
        >
          <svg width="16" height="26" viewBox="0 0 16 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Animated light rays */}
            <g className="lighthouse-light">
              <path d="M3 5L0 2.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M13 5L16 2.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M8 3V0" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M4.5 3.5L2 1.5" stroke="#F0C674" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
              <path d="M11.5 3.5L14 1.5" stroke="#F0C674" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
            </g>
            {/* Lamp housing */}
            <rect x="5" y="3" width="6" height="5" rx="1" fill="#F0C674" />
            {/* Lamp glow */}
            <rect x="6.5" y="4" width="3" height="3" rx="0.5" fill="#FAF7F2" fillOpacity="0.85" />
            {/* Gallery rail */}
            <rect x="4" y="8" width="8" height="1.5" rx="0.5" fill="#D4941F" />
            {/* Tower upper — lighter */}
            <path d="M5 9.5H11L10.7 14.5H5.3L5 9.5Z" fill="#E8A838" fillOpacity="0.7" />
            {/* Tower lower — darker for contrast */}
            <path d="M5.3 14.5H10.7L10.5 20H5.5L5.3 14.5Z" fill="#B07818" fillOpacity="0.85" />
            {/* Tower stripe divider */}
            <rect x="5.2" y="14" width="5.6" height="1" rx="0.25" fill="#D4941F" fillOpacity="0.6" />
            {/* Base */}
            <rect x="3.5" y="20" width="9" height="2" rx="0.5" fill="#8B6514" />
          </svg>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{formatCurrency(min)}</span>
        <span>{formatCurrency(max)}</span>
      </div>

      {/* Legend linking the lighthouse marker to its meaning */}
      <button
        type="button"
        onClick={() => onChange(optimalValue)}
        className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-accent transition-colors cursor-pointer mt-1 self-start text-left"
      >
        <svg width="10" height="16" viewBox="0 0 16 26" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0" style={{ filter: "drop-shadow(0 0 3px rgba(240,198,116,0.4))" }}>
          <g className="lighthouse-light">
            <path d="M3 5L0 2.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M13 5L16 2.5" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M8 3V0" stroke="#F0C674" strokeWidth="1.2" strokeLinecap="round" />
          </g>
          <rect x="5" y="3" width="6" height="5" rx="1" fill="#F0C674" />
          <rect x="6.5" y="4" width="3" height="3" rx="0.5" fill="#FAF7F2" fillOpacity="0.85" />
          <rect x="4" y="8" width="8" height="1.5" rx="0.5" fill="#D4941F" />
          <path d="M5 9.5H11L10.7 14.5H5.3L5 9.5Z" fill="#E8A838" fillOpacity="0.7" />
          <path d="M5.3 14.5H10.7L10.5 20H5.5L5.3 14.5Z" fill="#B07818" fillOpacity="0.85" />
          <rect x="3.5" y="20" width="9" height="2" rx="0.5" fill="#8B6514" />
        </svg>
        <span>Conversion amount with highest estimated lifetime savings</span>
      </button>
    </div>
  );
}
