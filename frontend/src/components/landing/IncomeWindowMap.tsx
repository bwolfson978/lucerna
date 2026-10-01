"use client";

import { useState, type CSSProperties } from "react";
import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";
import { RangeControl } from "./RangeControl";

const AGE_MIN = 55;
const AGE_MAX = 95;
const TICKS = [55, 65, 75, 85, 95];
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";

/** Horizontal position (percent) for an age on the map. */
function x(age: number): number {
  return ((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;
}

function span(from: number, to: number): CSSProperties {
  return {
    left: `${x(from)}%`,
    width: `${Math.max(0, x(to) - x(from))}%`,
    transition: `left 600ms ${EASE}, width 600ms ${EASE}, opacity 600ms ease`,
  };
}

/**
 * Interactive lifetime income map. Drag retirement and Social Security ages
 * and watch the low-tax conversion window open or close before RMDs.
 * Shapes are illustrative, not computed from a scenario.
 */
export function IncomeWindowMap() {
  const [retireAge, setRetireAge] = useState(62);
  const [ssAge, setSsAge] = useState(70);
  const [rmdAge, setRmdAge] = useState<73 | 75>(75);
  const [ref, inView] = useInView<HTMLDivElement>(0.35);

  const windowYears = Math.max(0, rmdAge - retireAge);
  const lowestEnd = Math.max(retireAge, Math.min(ssAge, rmdAge));
  const lowestYears = lowestEnd - retireAge;

  return (
    <div
      ref={ref}
      className="rounded-[20px] border border-border bg-white px-5 py-6 shadow-[0_24px_60px_-34px_rgba(27,67,50,0.28)] sm:px-8 sm:py-8"
    >
      <div className="eyebrow mb-4 flex items-center justify-between gap-3">
        <span>Lifetime income map · illustrative</span>
        <span className="hidden text-pine-mid sm:inline">drag the sliders</span>
      </div>

      {/* Map */}
      <div className="relative ml-9 mr-2 h-[230px] sm:h-[250px]" aria-hidden="true">
        {/* Conversion window band */}
        <div
          className="absolute bottom-0 top-0 rounded-[10px] border-[1.5px] border-dashed border-pine-mid bg-[rgba(102,161,131,0.14)]"
          style={{ ...span(retireAge, rmdAge), opacity: inView ? 1 : 0 }}
        >
          <div className="absolute inset-x-0 top-2.5 text-center text-[11px] font-bold tracking-[0.08em] text-pine">
            CONVERSION WINDOW
            <div className="font-mono text-[11px] font-normal tracking-normal text-pine-mid">
              {windowYears} years
            </div>
          </div>
        </div>

        {/* Salary */}
        <div
          className="absolute bottom-0 z-[1] flex h-[55%] items-center justify-center overflow-hidden rounded-t-md bg-paper-deep text-[11.5px] text-text-tertiary"
          style={span(AGE_MIN, retireAge)}
        >
          salary
        </div>

        {/* Social Security */}
        <div
          className="absolute bottom-0 flex h-[24%] items-center justify-center overflow-hidden rounded-t-md bg-paper-stone text-[11.5px] text-[#5c5c5c]"
          style={span(ssAge, AGE_MAX)}
        >
          <span className="translate-x-[20%] whitespace-nowrap">Social Security</span>
        </div>

        {/* RMDs, stacked on Social Security */}
        <div
          className="absolute bottom-[24%] flex h-[58%] flex-col items-center justify-center bg-ember/80 pt-6 text-center text-white"
          style={{
            ...span(rmdAge, AGE_MAX),
            clipPath: "polygon(0% 38%, 22% 0%, 100% 0%, 100% 100%, 0% 100%)",
          }}
        >
          <span className="text-[12px] font-bold">RMDs</span>
          <span className="hidden text-[11px] sm:block">forced withdrawals</span>
        </div>

        {/* Lowest-tax years marker along the baseline */}
        <div
          className="absolute bottom-0 z-[3] h-0 border-b-[2.5px] border-dotted border-pine-mid"
          style={{ ...span(retireAge, lowestEnd), opacity: lowestYears > 0 ? 1 : 0 }}
        >
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-white/85 px-1 text-[11px] italic text-pine-mid">
            your lowest-tax years
          </span>
        </div>

        {/* Axis */}
        <div className="absolute -bottom-px left-0 right-0 h-[1.5px] bg-paper-stone" />
        <span className="absolute -left-9 bottom-[-22px] font-mono text-[11px] text-text-tertiary">
          age
        </span>
        {TICKS.map((t) => (
          <span
            key={t}
            className="absolute bottom-[-22px] -translate-x-1/2 font-mono text-[11px] text-text-tertiary"
            style={{ left: `${x(t)}%` }}
          >
            {t}
          </span>
        ))}

        {/* Event markers */}
        <Marker age={retireAge} label="retire" dotClass="bg-pine" labelClass="text-pine" />
        <Marker age={rmdAge} label="RMDs begin" dotClass="bg-ember" labelClass="text-negative" />
      </div>

      {/* Readout */}
      <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <Readout value={`${windowYears} years`} label={`window, age ${retireAge} to ${rmdAge}`} />
        <Readout
          value={`${lowestYears} years`}
          label={lowestYears > 0 ? "before Social Security starts" : "Social Security already on"}
        />
      </div>

      {/* Controls */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <RangeControl
          label="Retire at"
          value={retireAge}
          min={55}
          max={70}
          onChange={setRetireAge}
          display={`age ${retireAge}`}
        />
        <RangeControl
          label="Claim Social Security at"
          value={ssAge}
          min={62}
          max={70}
          onChange={setSsAge}
          display={`age ${ssAge}`}
        />
      </div>
      <fieldset className="mt-5 flex flex-wrap items-center gap-3">
        <legend className="sr-only">Age RMDs begin</legend>
        <span className="text-[13px] font-medium text-text-secondary">RMDs begin at</span>
        <div className="inline-flex rounded-full border border-border bg-paper-warm p-1">
          {([73, 75] as const).map((age) => (
            <button
              key={age}
              type="button"
              aria-pressed={rmdAge === age}
              onClick={() => setRmdAge(age)}
              className={cn(
                "min-h-[32px] rounded-full px-4 font-mono text-[13px] transition-colors duration-200",
                rmdAge === age
                  ? "bg-pine-deep text-[#f5f2ea]"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {age}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-text-tertiary">
          {rmdAge === 75 ? "born 1960 or later" : "born 1951 to 1959"}
        </span>
      </fieldset>
    </div>
  );
}

function Marker({
  age,
  label,
  dotClass,
  labelClass,
}: {
  age: number;
  label: string;
  dotClass: string;
  labelClass: string;
}) {
  return (
    <div
      className="absolute bottom-0 z-[2]"
      style={{ left: `${x(age)}%`, transition: `left 600ms ${EASE}` }}
    >
      <span
        className={cn(
          "absolute -bottom-[5px] -left-[5px] h-[10px] w-[10px] rounded-full ring-2 ring-white",
          dotClass
        )}
      />
      <span
        className={cn(
          "absolute -bottom-[42px] -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold",
          labelClass
        )}
      >
        {label}
      </span>
    </div>
  );
}

function Readout({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="font-serif text-[1.45rem] font-bold leading-tight text-pine">{value}</div>
      <div className="text-[12.5px] text-text-tertiary">{label}</div>
    </div>
  );
}
