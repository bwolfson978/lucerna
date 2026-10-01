"use client";

import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface RangeControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Text shown next to the label, e.g. "age 62" or "$48,000". */
  display: string;
  tone?: "light" | "dark";
  className?: string;
}

/** Labeled range slider with a filled track, used by the landing illustrations. */
export function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  tone = "light",
  className,
}: RangeControlProps) {
  const id = useId();
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const dark = tone === "dark";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className={cn("text-[13px] font-medium", dark ? "text-pine-haze" : "text-text-secondary")}
        >
          {label}
        </label>
        <span
          className={cn(
            "font-mono text-[13px] tabular-nums",
            dark ? "text-white" : "font-medium text-pine"
          )}
        >
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("landing-range", dark && "landing-range-dark")}
        style={{ "--pct": `${pct}%` } as CSSProperties}
      />
    </div>
  );
}
