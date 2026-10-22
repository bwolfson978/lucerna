"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import situationResults from "../../../../shared/fixtures/landing-situations.json";
import { useInView, usePrefersReducedMotion } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

type SituationId = keyof typeof situationResults;

interface LifeEvent {
  age: number;
  label: string;
  /** Label row, top down, so close-together events don't overlap. */
  row: 0 | 1 | 2;
  /** Required withdrawals are a cost, so they get the ember marker. */
  rmd?: boolean;
}

interface Situation {
  id: SituationId;
  label: string;
  who: string;
  detail: string;
  events: LifeEvent[];
}

// Copy for the four illustrative households. Their numbers come from the engine
// (backend/scripts/generate_landing_situations.py writes the JSON imported above).
export const SITUATIONS: Situation[] = [
  {
    id: "early-retirement",
    label: "Early retirement",
    who: "A couple retiring at 55",
    detail: "$1.1M in 401(k)s, living on savings until Social Security at 67.",
    events: [
      { age: 55, label: "Retires", row: 0 },
      { age: 67, label: "Social Security", row: 1 },
      { age: 75, label: "RMDs begin", row: 0, rmd: true },
    ],
  },
  {
    id: "before-social-security",
    label: "Before Social Security and RMDs",
    who: "A couple who just retired at 63",
    detail: "$1.4M in a 401(k). Social Security at 67, required withdrawals at 73.",
    events: [
      { age: 63, label: "Retires", row: 0 },
      { age: 67, label: "Social Security", row: 1 },
      { age: 73, label: "RMDs begin", row: 0, rmd: true },
    ],
  },
  {
    id: "part-time",
    label: "Part-time or consulting years",
    who: "A couple consulting part-time from 58",
    detail: "$950K in 401(k)s, about $50K a year of consulting until 65.",
    events: [
      { age: 58, label: "Goes part-time", row: 0 },
      { age: 65, label: "Stops working", row: 1 },
      { age: 67, label: "Social Security", row: 0 },
      { age: 75, label: "RMDs begin", row: 2, rmd: true },
    ],
  },
  {
    id: "career-break",
    label: "Career break",
    who: "Single, 44, out of work for two years",
    detail: "$320K in a 401(k), back to a $125K salary after.",
    events: [
      { age: 44, label: "Career break", row: 0 },
      { age: 46, label: "Back to work", row: 1 },
      { age: 75, label: "RMDs begin", row: 0, rmd: true },
    ],
  },
];

// Largest single-year conversion across all four, so bar heights compare across households.
const MAX_CONVERSION = Math.max(
  ...Object.values(situationResults).flatMap((r) => r.conversions_by_year)
);
const ROW_HEIGHT = 22;
// Auto-advance between situations until the visitor picks one.
const CYCLE_MS = 6500;
const COUNT_MS = 700;
const MOVE =
  "transition-all duration-[600ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none";

function formatDollars(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatShort(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : `$${Math.round(n / 1000)}K`;
}

/**
 * Landing hero: pick a life situation and see where its low-tax window falls on a
 * timeline, how much the optimizer converts each year, and what that is worth.
 */
export function HeroWindowTimeline() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const reduced = usePrefersReducedMotion();
  const [selected, setSelected] = useState<SituationId>("early-retirement");
  const [picked, setPicked] = useState(false);
  const [paused, setPaused] = useState(false);
  const situation = SITUATIONS.find((s) => s.id === selected) ?? SITUATIONS[0];
  const result = situationResults[situation.id];
  const savings = result.estimated_lifetime_tax_savings;

  // Bars and the window grow in each time a household is shown.
  const [grownFor, setGrownFor] = useState<SituationId | null>(null);
  const grown = reduced || grownFor === situation.id;
  useEffect(() => {
    if (!inView || reduced) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setGrownFor(situation.id));
    });
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, situation.id]);

  // The savings figure counts from the previous household's value to this one.
  const [shownSavings, setShownSavings] = useState(savings);
  const shownRef = useRef(savings);
  useEffect(() => {
    const from = shownRef.current;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / COUNT_MS);
      const value = from + (savings - from) * (1 - Math.pow(1 - t, 3));
      shownRef.current = value;
      setShownSavings(value);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [savings, reduced]);

  // Step through the situations on its own until the visitor picks one.
  useEffect(() => {
    if (!inView || reduced || picked || paused) return;
    const id = setInterval(() => {
      setSelected((current) => {
        const i = SITUATIONS.findIndex((s) => s.id === current);
        return SITUATIONS[(i + 1) % SITUATIONS.length].id;
      });
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [inView, reduced, picked, paused]);

  const startAge = result.start_age;
  // End a few years after the last milestone so the window fills the chart.
  const endAge = Math.max(...situation.events.map((e) => e.age)) + 4;
  const span = endAge - startAge + 1;
  const pct = (age: number) => ((age - startAge) / span) * 100;
  const slot = 100 / span;

  const bars = result.conversions_by_year
    .map((amount, i) => ({ age: startAge + i, amount }))
    .filter((b) => b.amount > 0);
  const firstAge = bars[0].age;
  const lastAge = bars[bars.length - 1].age;

  const tickStep = span > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let a = Math.ceil(startAge / tickStep) * tickStep; a <= endAge; a += tickStep) ticks.push(a);

  const gain = (result.after_tax_wealth_with / result.after_tax_wealth_without - 1) * 100;

  return (
    <div
      ref={ref}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="rounded-[20px] border border-border bg-white p-4 shadow-card sm:p-7"
    >
      <div role="group" aria-label="Life situation" className="flex flex-wrap justify-center gap-2">
        {SITUATIONS.map((s) => {
          const on = s.id === situation.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setPicked(true);
                setSelected(s.id);
              }}
              className={cn(
                "min-h-[44px] rounded-full border px-4 text-[14px] font-medium transition-colors duration-200 sm:px-[18px]",
                on
                  ? "border-pine-deep bg-pine-deep text-[#f5f2ea]"
                  : "border-border bg-white text-text-secondary hover:border-pine-mid hover:text-pine"
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-stretch gap-7">
        <div className="min-w-0 flex-[999_1_520px]">
          <p className="mb-3.5 text-[14px] text-text-secondary">
            <strong className="text-text-primary">{situation.who}.</strong> {situation.detail}
          </p>

          <div
            role="img"
            aria-label={`${situation.label}: the optimizer converts between ages ${firstAge} and ${lastAge}, before required withdrawals begin.`}
            className="relative h-[250px] sm:h-[300px]"
          >
            {situation.events.map((e) => {
              const right = pct(e.age) > 70;
              const top = e.row * ROW_HEIGHT;
              return (
                <div key={`${situation.id}-${e.age}-${e.label}`} aria-hidden="true">
                  <div
                    className={cn(
                      "absolute bottom-[25px] w-[2px]",
                      MOVE,
                      e.rmd ? "bg-ember" : "bg-paper-stone"
                    )}
                    style={{ left: `${pct(e.age)}%`, top: top + 18 }}
                  />
                  <div
                    className={cn(
                      "absolute whitespace-nowrap text-[12px] font-semibold",
                      MOVE,
                      e.rmd ? "text-[#c2410c]" : "text-text-primary",
                      right && "text-right"
                    )}
                    style={
                      right
                        ? { right: `${100 - pct(e.age)}%`, top }
                        : { left: `${pct(e.age)}%`, top }
                    }
                  >
                    {e.label} <span className="font-medium text-text-tertiary">{e.age}</span>
                  </div>
                </div>
              );
            })}

            {/* Plot area below the event labels */}
            <div className="absolute inset-x-0 bottom-[25px] top-[76px]" aria-hidden="true">
              <div
                className={cn("absolute inset-y-0 origin-left rounded-t-lg bg-sage/[0.14]", MOVE)}
                style={{
                  left: `${pct(firstAge)}%`,
                  width: `max(${pct(lastAge + 1) - pct(firstAge)}%, 8px)`,
                  transform: `scaleX(${grown ? 1 : 0})`,
                }}
              />
              <div
                className={cn(
                  "absolute top-2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.12em] text-pine-mid",
                  MOVE
                )}
                style={{ left: `calc(${pct(firstAge)}% + 8px)` }}
              >
                Low-tax window
              </div>
              {bars.map((b, i) => (
                <div
                  key={b.age}
                  className={cn(
                    "absolute bottom-0 rounded-t-[3px] bg-gradient-to-b from-pine-mid to-sage",
                    MOVE
                  )}
                  style={{
                    left: `calc(${pct(b.age)}% + 1px)`,
                    width: `max(calc(${slot}% - 2px), 3px)`,
                    height: grown ? `${Math.max(4, (b.amount / MAX_CONVERSION) * 78)}%` : "0%",
                    transitionDelay: grown && !reduced ? `${150 + i * 60}ms` : "0ms",
                  }}
                />
              ))}
            </div>

            <div
              className="absolute inset-x-0 bottom-[24px] h-px bg-paper-stone"
              aria-hidden="true"
            />
            {ticks.map((a) => (
              <div
                key={a}
                aria-hidden="true"
                className="absolute bottom-0 -translate-x-1/2 font-mono text-[11px] text-text-tertiary"
                style={{ left: `${pct(a)}%` }}
              >
                {a}
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-[18px] text-[12px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-pine-mid" />
              Roth conversion, by year
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-ember" />
              Required withdrawals begin
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5 rounded-2xl border border-pine-mid/20 bg-pine-mid/[0.07] p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#3d5a4c]">
            Estimated lifetime tax savings
          </div>
          <div className="mt-1 font-serif text-[46px] font-bold leading-[1.05] tracking-[-0.02em] text-pine-mid [font-variant-numeric:lining-nums_tabular-nums]">
            {formatDollars(shownSavings)}
          </div>
          <div className="my-3.5 h-px bg-pine-mid/20" />
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#3d5a4c]">
            After-tax wealth
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2.5 [font-variant-numeric:lining-nums_tabular-nums]">
            <span className="font-serif text-[20px] text-text-secondary">
              <span className="sr-only">Without conversions </span>
              {formatShort(result.after_tax_wealth_without)}
            </span>
            <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true">
              <path
                d="M1 6h17M13 1l5 5-5 5"
                fill="none"
                stroke="#2d6a4f"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-serif text-[24px] font-bold text-text-primary">
              <span className="sr-only">with conversions </span>
              {formatShort(result.after_tax_wealth_with)}
            </span>
            <span className="rounded-full bg-pine-mid/[0.14] px-2.5 py-0.5 text-[13px] font-semibold text-pine">
              +{gain.toFixed(1)}%
            </span>
          </div>
          <div className="mt-auto flex flex-col gap-2.5 pt-5">
            <Link href="/calculator" className="btn-pill bg-pine text-[#f5f2ea] hover:bg-pine-deep">
              Try your own numbers
            </Link>
            <Link
              href="/demo"
              className="btn-pill border-pine-mid/30 bg-white text-pine hover:border-pine-mid"
            >
              See an example
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[12px] leading-normal text-text-tertiary">
        Illustrative households, federal tax only, in today&apos;s dollars. Figures from the
        optimizer. Educational scenario modeling, not tax or financial advice.
      </p>
    </div>
  );
}
