"use client";

import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Horizontal timeline showing the 4 phases of the NPV lifetime model:
 * 1. Conversion years, 2. Growth to retirement, 3. Retirement, 4. Money left at the end
 */
export function NpvTimeline() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const left = 20;
  const right = 540;
  const totalWidth = right - left;
  const trackY = 80;
  const trackHeight = 40;

  // Phase proportions (approximate life timeline)
  const phases = [
    {
      label: "Conversion\nyears",
      pct: 0.12,
      color: "#a8a294",
      opacity: 0.5,
      note: "Pay tax, shift\nbalances, grow",
    },
    {
      label: "Growth to\nretirement",
      pct: 0.38,
      color: "#5c5c5c",
      opacity: 0.15,
      note: "Both accounts\ngrow untouched",
    },
    {
      label: "Retirement\ndistributions",
      pct: 0.38,
      color: "#2d6a4f",
      opacity: 0.3,
      note: "Traditional taxed,\nRoth tax-free",
    },
    {
      label: "Money left\nat the end",
      pct: 0.12,
      color: "#1b4332",
      opacity: 0.2,
      note: "Traditional counted\nafter tax",
    },
  ];

  let cx = left;
  const phaseRects = phases.map((phase) => {
    const w = phase.pct * totalWidth;
    const rect = { ...phase, x: cx, w };
    cx += w;
    return rect;
  });

  // Age markers
  const ageMarkers = [
    { label: "Age 38", x: left },
    { label: "Age 41", x: left + phases[0].pct * totalWidth },
    { label: "Age 65", x: left + (phases[0].pct + phases[1].pct) * totalWidth },
    { label: "Age 90", x: left + (phases[0].pct + phases[1].pct + phases[2].pct) * totalWidth },
  ];

  return (
    <svg
      viewBox="0 0 560 200"
      className="mx-auto w-full max-w-[560px]"
      role="img"
      aria-label="Timeline showing the four phases of the lifetime financial model: conversion years, growth to retirement, retirement distributions, and money left at the end, counted after tax"
    >
      {/* Phase bars */}
      {phaseRects.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x}
            y={trackY}
            width={p.w}
            height={trackHeight}
            rx={i === 0 ? "8" : i === phases.length - 1 ? "8" : "0"}
            fill={p.color}
            opacity={p.opacity}
          />
          {/* Border between phases */}
          {i > 0 && (
            <line
              x1={p.x}
              y1={trackY}
              x2={p.x}
              y2={trackY + trackHeight}
              stroke="rgba(20, 20, 20, 0.1)"
              strokeWidth="1"
            />
          )}
        </g>
      ))}

      {/* Phase labels above */}
      {phaseRects.map((p, i) => {
        const lines = p.label.split("\n");
        return (
          <g key={`label-${i}`}>
            {lines.map((line, li) => (
              <text
                key={li}
                x={p.x + p.w / 2}
                y={trackY - 18 + li * 14}
                textAnchor="middle"
                fill={p.color === "#5c5c5c" ? "#5c5c5c" : p.color}
                fontFamily={labelFont}
                fontSize="10"
                fontWeight="600"
                opacity={p.color === "#5c5c5c" ? 0.7 : 1}
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {/* Phase descriptions below */}
      {phaseRects.map((p, i) => {
        const lines = p.note.split("\n");
        return (
          <g key={`note-${i}`}>
            {lines.map((line, li) => (
              <text
                key={li}
                x={p.x + p.w / 2}
                y={trackY + trackHeight + 18 + li * 13}
                textAnchor="middle"
                fill="#737373"
                fontFamily={labelFont}
                fontSize="9"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {/* Age markers */}
      {ageMarkers.map((marker) => (
        <g key={marker.label}>
          <line
            x1={marker.x}
            y1={trackY + trackHeight}
            x2={marker.x}
            y2={trackY + trackHeight + 6}
            stroke="rgba(20, 20, 20, 0.2)"
            strokeWidth="1"
          />
          <text
            x={marker.x}
            y={trackY + trackHeight + 55}
            textAnchor="middle"
            fill="#141414"
            fontFamily={DATA_FONT_FAMILY}
            fontSize="10"
            fontWeight="700"
          >
            {marker.label}
          </text>
        </g>
      ))}

      {/* Discount rate annotation */}
      <text
        x={right / 2 + left / 2}
        y={195}
        textAnchor="middle"
        fill="#737373"
        fontFamily={labelFont}
        fontSize="9"
      >
        All future values discounted at 5% to express savings in today&apos;s dollars
      </text>
    </svg>
  );
}
