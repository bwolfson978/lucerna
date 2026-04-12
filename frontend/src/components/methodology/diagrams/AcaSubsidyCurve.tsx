"use client";

import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Shows total cost (federal tax + subsidy loss) rising with conversion amount,
 * with a visible cliff where ACA subsidies are eliminated entirely.
 */
export function AcaSubsidyCurve() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const left = 60;
  const right = 500;
  const top = 30;
  const bottom = 170;
  const width = right - left;
  const height = bottom - top;

  // Cliff position at ~60% of conversion range
  const cliffX = left + 0.58 * width;
  const cliffYBefore = top + height * 0.55;
  const cliffYAfter = top + height * 0.22;

  // Cost curve path (gradual rise then cliff)
  const costPath = [
    `M ${left} ${bottom}`,
    `C ${left + width * 0.15} ${bottom - height * 0.15},`,
    `  ${left + width * 0.35} ${bottom - height * 0.30},`,
    `  ${cliffX - 2} ${cliffYBefore}`,
  ].join(" ");

  // After cliff continues higher
  const postCliffPath = [
    `M ${cliffX} ${cliffYAfter}`,
    `C ${cliffX + width * 0.12} ${cliffYAfter - height * 0.05},`,
    `  ${cliffX + width * 0.28} ${cliffYAfter - height * 0.10},`,
    `  ${right} ${top + height * 0.10}`,
  ].join(" ");

  return (
    <svg
      viewBox="0 0 560 220"
      className="w-full max-w-[560px] mx-auto"
      role="img"
      aria-label="Chart showing how total conversion cost rises gradually then jumps sharply at the ACA subsidy cliff"
    >
      {/* Axes */}
      <line x1={left} y1={top} x2={left} y2={bottom}
        stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />
      <line x1={left} y1={bottom} x2={right} y2={bottom}
        stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1" />

      {/* Y-axis label */}
      <text x={18} y={top + height / 2} textAnchor="middle" fill="#8B8A99"
        fontFamily={labelFont} fontSize="9"
        transform={`rotate(-90, 18, ${top + height / 2})`}>
        Total cost per dollar converted
      </text>

      {/* X-axis label */}
      <text x={left + width / 2} y={bottom + 28} textAnchor="middle" fill="#8B8A99"
        fontFamily={labelFont} fontSize="9">
        Total conversion amount (MAGI increases)
      </text>

      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map((frac) => (
        <line key={frac}
          x1={left} y1={top + frac * height} x2={right} y2={top + frac * height}
          stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="4 4" strokeWidth="1" />
      ))}

      {/* Subsidy zone background */}
      <rect x={left} y={top} width={cliffX - left} height={height}
        fill="rgba(94, 189, 140, 0.04)" />

      {/* No-subsidy zone */}
      <rect x={cliffX} y={top} width={right - cliffX} height={height}
        fill="rgba(232, 112, 112, 0.03)" />

      {/* Cost curve before cliff */}
      <path d={costPath} fill="none" stroke="#F0C674" strokeWidth="2" />

      {/* Cliff jump */}
      <line x1={cliffX} y1={cliffYBefore} x2={cliffX} y2={cliffYAfter}
        stroke="#E87070" strokeWidth="2" strokeDasharray="4 3" />

      {/* Cost curve after cliff */}
      <path d={postCliffPath} fill="none" stroke="#E87070" strokeWidth="2" />

      {/* Cliff marker */}
      <circle cx={cliffX} cy={cliffYBefore} r="4" fill="#F0C674" />
      <circle cx={cliffX} cy={cliffYAfter} r="4" fill="#E87070" />

      {/* Zone labels */}
      <text x={left + (cliffX - left) / 2} y={top + 16} textAnchor="middle"
        fill="#5EBD8C" fontFamily={labelFont} fontSize="9" fontWeight="500">
        Subsidy preserved
      </text>
      <text x={cliffX + (right - cliffX) / 2} y={top + 16} textAnchor="middle"
        fill="#E87070" fontFamily={labelFont} fontSize="9" fontWeight="500">
        Subsidy lost
      </text>

      {/* Cliff annotation */}
      <text x={cliffX + 8} y={(cliffYBefore + cliffYAfter) / 2 + 4}
        fill="#E87070" fontFamily={labelFont} fontSize="9" fontWeight="500">
        400% FPL cliff
      </text>

      {/* Legend */}
      <g>
        <line x1={left + 10} y1={200} x2={left + 30} y2={200}
          stroke="#F0C674" strokeWidth="2" />
        <text x={left + 36} y={203} fill="#B8B0D2"
          fontFamily={labelFont} fontSize="9">
          Tax cost only
        </text>

        <line x1={left + 140} y1={200} x2={left + 160} y2={200}
          stroke="#E87070" strokeWidth="2" />
        <text x={left + 166} y={203} fill="#B8B0D2"
          fontFamily={labelFont} fontSize="9">
          Tax + subsidy loss
        </text>
      </g>
    </svg>
  );
}
