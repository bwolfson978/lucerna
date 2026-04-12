"use client";

import { DATA_FONT_FAMILY } from "@/lib/utils/constants";

/**
 * Horizontal flowchart showing the optimization pipeline:
 * Your inputs -> Bracket fill heuristic -> Numerical optimizer -> Your results
 */
export function OptimizationPipeline() {
  const labelFont = "'Inter', system-ui, sans-serif";

  const nodes = [
    { label: "Your inputs", sublabel: "Income, balances,\ntimeline", color: "#B8B0D2" },
    { label: "Bracket fill", sublabel: "Greedy heuristic\n(starting point)", color: "#6C5CE7" },
    { label: "Optimizer", sublabel: "Numerical search\n(SLSQP, 3 restarts)", color: "#F0C674" },
    { label: "Your results", sublabel: "Optimal schedule\n+ explanation", color: "#5EBD8C" },
  ];

  const nodeW = 110;
  const nodeH = 80;
  const gap = 30;
  const arrowLen = gap;
  const startX = 15;
  const startY = 30;

  return (
    <svg
      viewBox="0 0 560 140"
      className="w-full max-w-[560px] mx-auto"
      role="img"
      aria-label="Flowchart showing optimization pipeline: your inputs, bracket fill heuristic, numerical optimizer, your results"
    >
      {nodes.map((node, i) => {
        const x = startX + i * (nodeW + gap + arrowLen);
        const centerX = x + nodeW / 2;

        return (
          <g key={i}>
            {/* Node box */}
            <rect
              x={x} y={startY} width={nodeW} height={nodeH} rx="12"
              fill="rgba(255, 255, 255, 0.04)"
              stroke={node.color}
              strokeWidth="1.5"
              strokeOpacity="0.5"
            />

            {/* Label */}
            <text x={centerX} y={startY + 22} textAnchor="middle"
              fill="#FAF7F2" fontFamily={DATA_FONT_FAMILY} fontSize="12" fontWeight="700">
              {node.label}
            </text>

            {/* Sublabel */}
            {node.sublabel.split("\n").map((line, li) => (
              <text key={li} x={centerX} y={startY + 40 + li * 13}
                textAnchor="middle" fill="#8B8A99"
                fontFamily={labelFont} fontSize="9">
                {line}
              </text>
            ))}

            {/* Arrow to next node */}
            {i < nodes.length - 1 && (
              <g>
                <line
                  x1={x + nodeW + 4} y1={startY + nodeH / 2}
                  x2={x + nodeW + arrowLen - 4} y2={startY + nodeH / 2}
                  stroke="#F0C674" strokeWidth="1.5" strokeOpacity="0.5"
                />
                <polygon
                  points={`${x + nodeW + arrowLen - 6},${startY + nodeH / 2 - 4} ${x + nodeW + arrowLen},${startY + nodeH / 2} ${x + nodeW + arrowLen - 6},${startY + nodeH / 2 + 4}`}
                  fill="#F0C674" opacity="0.6"
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
