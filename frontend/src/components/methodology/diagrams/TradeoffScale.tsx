"use client";

import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Shows the marginal cost of converting rising as conversion amount increases,
 * crossing the expected retirement withdrawal rate. The intersection is the
 * optimal conversion point.
 */
export function TradeoffScale() {
  const labelFont = "'Inter', system-ui, sans-serif";

  // Chart area
  const left = 60;
  const right = 500;
  const top = 30;
  const bottom = 170;
  const width = right - left;
  const height = bottom - top;

  // Retirement rate line at ~22%
  const retirementY = top + height * 0.42;

  // Marginal cost curve: starts at ~10%, rises through brackets
  // Stepped line representing bracket boundaries
  const steps = [
    { x: 0, y: 0.85 }, // 10% bracket
    { x: 0.15, y: 0.85 },
    { x: 0.15, y: 0.72 }, // 12% bracket
    { x: 0.42, y: 0.72 },
    { x: 0.42, y: 0.5 }, // 22% bracket step (crosses retirement line)
    { x: 0.68, y: 0.5 },
    { x: 0.68, y: 0.38 }, // 24% bracket
    { x: 0.9, y: 0.38 },
    { x: 0.9, y: 0.18 }, // 32% bracket
    { x: 1.0, y: 0.18 },
  ];

  const costPath = steps
    .map((s, i) => {
      const x = left + s.x * width;
      const y = top + s.y * height;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  // Find the intersection point (where 22% bracket meets retirement line)
  const intersectX = left + 0.42 * width;

  return (
    <svg
      viewBox="0 0 560 220"
      className="mx-auto w-full max-w-[560px]"
      role="img"
      aria-label="Chart showing marginal tax cost rising with conversion amount, crossing the expected retirement rate at the optimal point"
    >
      {/* Y-axis */}
      <line
        x1={left}
        y1={top}
        x2={left}
        y2={bottom}
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth="1"
      />
      <text
        x={left - 8}
        y={top + 5}
        textAnchor="end"
        fill="#8B8A99"
        fontFamily={labelFont}
        fontSize="9"
      >
        37%
      </text>
      <text
        x={left - 8}
        y={bottom}
        textAnchor="end"
        fill="#8B8A99"
        fontFamily={labelFont}
        fontSize="9"
      >
        0%
      </text>
      <text
        x={20}
        y={top + height / 2}
        textAnchor="middle"
        fill="#8B8A99"
        fontFamily={labelFont}
        fontSize="9"
        transform={`rotate(-90, 20, ${top + height / 2})`}
      >
        Marginal rate
      </text>

      {/* X-axis */}
      <line
        x1={left}
        y1={bottom}
        x2={right}
        y2={bottom}
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth="1"
      />
      <text
        x={left + width / 2}
        y={bottom + 30}
        textAnchor="middle"
        fill="#8B8A99"
        fontFamily={labelFont}
        fontSize="9"
      >
        Conversion amount
      </text>
      <text
        x={left}
        y={bottom + 16}
        textAnchor="start"
        fill="#8B8A99"
        fontFamily={labelFont}
        fontSize="9"
      >
        $0
      </text>
      <text
        x={right}
        y={bottom + 16}
        textAnchor="end"
        fill="#8B8A99"
        fontFamily={labelFont}
        fontSize="9"
      >
        Full balance
      </text>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <line
          key={frac}
          x1={left}
          y1={top + frac * height}
          x2={right}
          y2={top + frac * height}
          stroke="rgba(255, 255, 255, 0.04)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      ))}

      {/* Retirement rate line */}
      <line
        x1={left}
        y1={retirementY}
        x2={right}
        y2={retirementY}
        stroke="#5EBD8C"
        strokeWidth="1.5"
        strokeDasharray="6 4"
      />
      <text
        x={right + 4}
        y={retirementY + 4}
        fill="#5EBD8C"
        fontFamily={labelFont}
        fontSize="9"
        fontWeight="500"
      >
        Expected
      </text>
      <text
        x={right + 4}
        y={retirementY + 14}
        fill="#5EBD8C"
        fontFamily={labelFont}
        fontSize="9"
        fontWeight="500"
      >
        retirement rate
      </text>

      {/* Marginal cost stepped line */}
      <path d={costPath} fill="none" stroke="#F0C674" strokeWidth="2" />

      {/* Shaded "beneficial" area (below retirement rate) */}
      <rect
        x={left}
        y={retirementY}
        width={intersectX - left}
        height={bottom - retirementY}
        fill="rgba(94, 189, 140, 0.06)"
      />

      {/* Shaded "costly" area (above retirement rate, after intersection) */}
      <rect
        x={intersectX}
        y={top}
        width={right - intersectX}
        height={retirementY - top}
        fill="rgba(232, 112, 112, 0.04)"
      />

      {/* Optimal point marker */}
      <circle cx={intersectX} cy={retirementY} r="6" fill="#F0C674" className="optimal-marker" />
      <circle cx={intersectX} cy={retirementY} r="3" fill="#0F0E1A" />

      {/* Optimal label */}
      <text
        x={intersectX}
        y={retirementY - 14}
        textAnchor="middle"
        fill="#F0C674"
        fontFamily={DATA_FONT_FAMILY}
        fontSize="11"
        fontWeight="700"
      >
        Optimal point
      </text>

      {/* Zone labels */}
      <text
        x={left + (intersectX - left) / 2}
        y={bottom - 8}
        textAnchor="middle"
        fill="#5EBD8C"
        fontFamily={labelFont}
        fontSize="9"
        opacity="0.8"
      >
        Conversion saves money
      </text>
      <text
        x={intersectX + (right - intersectX) / 2}
        y={top + 20}
        textAnchor="middle"
        fill="#E87070"
        fontFamily={labelFont}
        fontSize="9"
        opacity="0.7"
      >
        Conversion costs more than it saves
      </text>
    </svg>
  );
}
