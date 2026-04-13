"use client";

import { CHART_COLORS, DATA_FONT_FAMILY } from "@/lib/utils/constants";

const LABEL_FONT = "'Inter', system-ui, sans-serif";
const LEFT = 40;
const BAR_WIDTH = 60;
const GROUP_GAP = 100;
const BAR_BOTTOM = 180;
const MAX_BAR_HEIGHT = 140;

interface BarGroupProps {
  x: number;
  tradHeight: number;
  rmdHeight: number;
  rothHeight: number;
  title: string;
}

function BarGroup({ x, tradHeight, rmdHeight, rothHeight, title }: BarGroupProps) {
  const tradH = tradHeight * MAX_BAR_HEIGHT;
  const rmdH = rmdHeight * MAX_BAR_HEIGHT;
  const rothH = rothHeight * MAX_BAR_HEIGHT;

  return (
    <g>
      {/* Title */}
      <text
        x={x + BAR_WIDTH}
        y={20}
        textAnchor="middle"
        fill="#FAF7F2"
        fontFamily={LABEL_FONT}
        fontSize="11"
        fontWeight="600"
      >
        {title}
      </text>

      {/* Traditional balance bar */}
      <rect
        x={x}
        y={BAR_BOTTOM - tradH}
        width={BAR_WIDTH}
        height={tradH}
        rx="4"
        fill={CHART_COLORS.income}
        opacity="0.5"
      />
      <text
        x={x + BAR_WIDTH / 2}
        y={BAR_BOTTOM - tradH - 6}
        textAnchor="middle"
        fill="#B8B0D2"
        fontFamily={LABEL_FONT}
        fontSize="9"
      >
        Traditional
      </text>

      {/* RMD indicator bar (overlaid on traditional, showing forced withdrawal) */}
      <rect
        x={x + 4}
        y={BAR_BOTTOM - rmdH}
        width={BAR_WIDTH - 8}
        height={rmdH}
        rx="3"
        fill="#E87070"
        opacity="0.25"
        stroke="#E87070"
        strokeWidth="1"
        strokeDasharray="3 2"
      />
      {rmdH > 30 && (
        <text
          x={x + BAR_WIDTH / 2}
          y={BAR_BOTTOM - rmdH / 2 + 4}
          textAnchor="middle"
          fill="#E87070"
          fontFamily={DATA_FONT_FAMILY}
          fontSize="9"
          fontWeight="600"
        >
          RMDs
        </text>
      )}

      {/* Roth balance bar */}
      <rect
        x={x + BAR_WIDTH + 10}
        y={BAR_BOTTOM - rothH}
        width={BAR_WIDTH}
        height={rothH}
        rx="4"
        fill={CHART_COLORS.conversion}
        opacity="0.5"
      />
      <text
        x={x + BAR_WIDTH + 10 + BAR_WIDTH / 2}
        y={BAR_BOTTOM - rothH - 6}
        textAnchor="middle"
        fill="#B8B0D2"
        fontFamily={LABEL_FONT}
        fontSize="9"
      >
        Roth
      </text>
    </g>
  );
}

/**
 * Before/after comparison showing how Roth conversions reduce
 * future Required Minimum Distributions. Two side-by-side bar clusters.
 */
export function RmdComparison() {
  // Group 1: Without conversion
  const g1x = LEFT + 40;
  const tradNoConv = 0.85; // large traditional balance
  const rmdNoConv = 0.7; // large RMDs
  const rothNoConv = 0.05; // small Roth

  // Group 2: With conversion
  const g2x = g1x + BAR_WIDTH * 2 + GROUP_GAP;
  const tradWithConv = 0.35; // reduced traditional
  const rmdWithConv = 0.28; // reduced RMDs
  const rothWithConv = 0.55; // larger Roth

  return (
    <svg
      viewBox="0 0 560 230"
      className="mx-auto w-full max-w-[560px]"
      role="img"
      aria-label="Comparison showing that converting to Roth reduces traditional IRA balance and future Required Minimum Distributions"
    >
      <BarGroup
        x={g1x}
        tradHeight={tradNoConv}
        rmdHeight={rmdNoConv}
        rothHeight={rothNoConv}
        title="Without conversion"
      />

      {/* Arrow between groups */}
      <line
        x1={g1x + BAR_WIDTH * 2 + 20}
        y1={BAR_BOTTOM / 2 + 20}
        x2={g2x - 20}
        y2={BAR_BOTTOM / 2 + 20}
        stroke="#F0C674"
        strokeWidth="1.5"
        strokeOpacity="0.4"
      />
      <polygon
        points={`${g2x - 22},${BAR_BOTTOM / 2 + 16} ${g2x - 14},${BAR_BOTTOM / 2 + 20} ${g2x - 22},${BAR_BOTTOM / 2 + 24}`}
        fill="#F0C674"
        opacity="0.5"
      />
      <text
        x={(g1x + BAR_WIDTH * 2 + 20 + g2x - 20) / 2}
        y={BAR_BOTTOM / 2 + 10}
        textAnchor="middle"
        fill="#F0C674"
        fontFamily={LABEL_FONT}
        fontSize="9"
        fontWeight="500"
      >
        Convert
      </text>

      <BarGroup
        x={g2x}
        tradHeight={tradWithConv}
        rmdHeight={rmdWithConv}
        rothHeight={rothWithConv}
        title="With conversion"
      />

      {/* Bottom labels */}
      <text
        x={g1x + BAR_WIDTH}
        y={BAR_BOTTOM + 18}
        textAnchor="middle"
        fill="#E87070"
        fontFamily={LABEL_FONT}
        fontSize="9"
      >
        Large forced taxable withdrawals
      </text>
      <text
        x={g2x + BAR_WIDTH}
        y={BAR_BOTTOM + 18}
        textAnchor="middle"
        fill="#5EBD8C"
        fontFamily={LABEL_FONT}
        fontSize="9"
      >
        Smaller RMDs, more tax-free growth
      </text>

      {/* Legend */}
      <g>
        <rect
          x={LEFT}
          y={212}
          width="10"
          height="10"
          rx="2"
          fill="#E87070"
          opacity="0.25"
          stroke="#E87070"
          strokeWidth="0.5"
        />
        <text x={LEFT + 16} y={221} fill="#B8B0D2" fontFamily={LABEL_FONT} fontSize="9">
          Required Minimum Distributions (taxed)
        </text>
      </g>
    </svg>
  );
}
