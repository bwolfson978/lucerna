"use client";

import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Horizontal flowchart showing the optimization pipeline:
 * Your inputs -> Bracket fill heuristic -> Numerical optimizer -> Your results
 *
 * Sized to fit within a 560px viewBox on mobile without overflow.
 */
export function OptimizationPipeline() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const nodes = [
    { label: "Your inputs", sublabel: "Income, balances,\ntimeline", color: "#5c5c5c" },
    { label: "Bracket fill", sublabel: "Greedy heuristic\n(starting point)", color: "#a8a294" },
    { label: "Optimizer", sublabel: "Numerical search\n(3 restarts)", color: "#2d6a4f" },
    { label: "Your results", sublabel: "Optimal schedule\n+ explanation", color: "#2d6a4f" },
  ];

  const nodeW = 105;
  const nodeH = 76;
  const arrowGap = 22;
  const startX = 10;
  const startY = 24;

  return (
    <svg
      viewBox="0 0 560 130"
      className="mx-auto w-full max-w-[560px]"
      role="img"
      aria-label="Flowchart showing optimization pipeline: your inputs, bracket fill heuristic, numerical optimizer, your results"
    >
      {nodes.map((node, i) => {
        const x = startX + i * (nodeW + arrowGap);
        const centerX = x + nodeW / 2;

        return (
          <g key={i}>
            {/* Node box */}
            <rect
              x={x}
              y={startY}
              width={nodeW}
              height={nodeH}
              rx="12"
              fill="rgba(20, 20, 20, 0.04)"
              stroke={node.color}
              strokeWidth="1.5"
              strokeOpacity="0.5"
            />

            {/* Label */}
            <text
              x={centerX}
              y={startY + 20}
              textAnchor="middle"
              fill="#141414"
              fontFamily={DATA_FONT_FAMILY}
              fontSize="11"
              fontWeight="700"
            >
              {node.label}
            </text>

            {/* Sublabel */}
            {node.sublabel.split("\n").map((line, li) => (
              <text
                key={li}
                x={centerX}
                y={startY + 36 + li * 13}
                textAnchor="middle"
                fill="#737373"
                fontFamily={labelFont}
                fontSize="9"
              >
                {line}
              </text>
            ))}

            {/* Arrow to next node */}
            {i < nodes.length - 1 && (
              <g>
                <line
                  x1={x + nodeW + 3}
                  y1={startY + nodeH / 2}
                  x2={x + nodeW + arrowGap - 5}
                  y2={startY + nodeH / 2}
                  stroke="#2d6a4f"
                  strokeWidth="1.5"
                  strokeOpacity="0.4"
                />
                <polygon
                  points={`${x + nodeW + arrowGap - 7},${startY + nodeH / 2 - 3.5} ${x + nodeW + arrowGap - 1},${startY + nodeH / 2} ${x + nodeW + arrowGap - 7},${startY + nodeH / 2 + 3.5}`}
                  fill="#2d6a4f"
                  opacity="0.5"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
