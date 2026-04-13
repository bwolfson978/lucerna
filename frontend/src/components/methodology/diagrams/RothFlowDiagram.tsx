"use client";

import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Illustrates money flowing from a Traditional IRA through a "tax gate"
 * into a Roth IRA, then growing tax-free.
 */
export function RothFlowDiagram() {
  const labelFont = "'Inter', system-ui, sans-serif";

  return (
    <svg
      viewBox="0 0 560 220"
      className="mx-auto w-full max-w-[560px]"
      role="img"
      aria-label="Diagram showing money moving from a Traditional IRA through a tax payment into a Roth IRA where it grows tax-free"
    >
      <defs>
        <linearGradient id="roth-arrow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6C5CE7" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#F0C674" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#F0C674" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Traditional IRA box */}
      <rect
        x="20"
        y="60"
        width="150"
        height="100"
        rx="12"
        fill="rgba(108, 92, 231, 0.12)"
        stroke="#6C5CE7"
        strokeWidth="1.5"
      />
      <text
        x="95"
        y="95"
        textAnchor="middle"
        fill="#B8B0D2"
        fontFamily={labelFont}
        fontSize="11"
        fontWeight="500"
      >
        TRADITIONAL IRA
      </text>
      <text
        x="95"
        y="125"
        textAnchor="middle"
        fill="#FAF7F2"
        fontFamily={DATA_FONT_FAMILY}
        fontSize="20"
        fontWeight="700"
      >
        $210,000
      </text>
      <text x="95" y="147" textAnchor="middle" fill="#8B8A99" fontFamily={labelFont} fontSize="10">
        Tax-deferred growth
      </text>

      {/* Arrow with tax gate */}
      <line
        x1="170"
        y1="110"
        x2="240"
        y2="110"
        stroke="url(#roth-arrow)"
        strokeWidth="2"
        strokeDasharray="6 3"
      />

      {/* Tax gate */}
      <rect
        x="240"
        y="75"
        width="80"
        height="70"
        rx="8"
        fill="rgba(255, 255, 255, 0.04)"
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth="1"
      />
      <text
        x="280"
        y="100"
        textAnchor="middle"
        fill="#E8837C"
        fontFamily={labelFont}
        fontSize="10"
        fontWeight="600"
      >
        TAX PAID
      </text>
      <text
        x="280"
        y="118"
        textAnchor="middle"
        fill="#E8837C"
        fontFamily={DATA_FONT_FAMILY}
        fontSize="14"
        fontWeight="700"
      >
        10-22%
      </text>
      <text x="280" y="136" textAnchor="middle" fill="#8B8A99" fontFamily={labelFont} fontSize="9">
        at current rate
      </text>

      {/* Arrow out of tax gate */}
      <line
        x1="320"
        y1="110"
        x2="388"
        y2="110"
        stroke="url(#roth-arrow)"
        strokeWidth="2"
        strokeDasharray="6 3"
      />
      {/* Arrowhead */}
      <polygon points="386,104 396,110 386,116" fill="#F0C674" opacity="0.7" />

      {/* Roth IRA box */}
      <rect
        x="390"
        y="60"
        width="150"
        height="100"
        rx="12"
        fill="rgba(240, 198, 116, 0.1)"
        stroke="#F0C674"
        strokeWidth="1.5"
      />
      <text
        x="465"
        y="95"
        textAnchor="middle"
        fill="#B8B0D2"
        fontFamily={labelFont}
        fontSize="11"
        fontWeight="500"
      >
        ROTH IRA
      </text>
      <text
        x="465"
        y="125"
        textAnchor="middle"
        fill="#FAF7F2"
        fontFamily={DATA_FONT_FAMILY}
        fontSize="20"
        fontWeight="700"
      >
        Tax-Free
      </text>
      <text x="465" y="147" textAnchor="middle" fill="#5EBD8C" fontFamily={labelFont} fontSize="10">
        Tax-free growth forever
      </text>

      {/* Labels below */}
      <text x="95" y="190" textAnchor="middle" fill="#8B8A99" fontFamily={labelFont} fontSize="10">
        Withdrawals taxed in retirement
      </text>
      <text x="465" y="190" textAnchor="middle" fill="#8B8A99" fontFamily={labelFont} fontSize="10">
        Withdrawals never taxed
      </text>
    </svg>
  );
}
