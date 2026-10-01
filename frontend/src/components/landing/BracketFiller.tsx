"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/useInView";
import { useTaxConfig } from "@/lib/tax/TaxConfigProvider";
import { calculateFederalTax } from "@/lib/tax/brackets";
import { formatCurrency } from "@/lib/utils/formatting";
import type { FilingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RangeControl } from "./RangeControl";

const SHOWN_RATES = [0.1, 0.12, 0.22, 0.24, 0.32];
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const MAX_CONVERSION = 400_000;

interface Row {
  rate: number;
  capacity: number;
  base: number;
  converted: number;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function caption(topRate: number): string {
  if (topRate <= 0.12)
    return "Converting at 12% or less: about the cheapest tax you will ever pay on these dollars.";
  if (topRate <= 0.22)
    return "Conversion dollars top up the 22% bracket, often cheaper than RMDs taxed at 24% to 32% later.";
  if (topRate <= 0.24) return "Into 24%. Still cheaper than paying 32% later, in many scenarios.";
  return "This reaches 32%. Optimized schedules usually stop short of here.";
}

/**
 * One year, optimized: drag a conversion amount and watch it pour into the
 * federal brackets on top of other income. Uses the same 2026 bracket data
 * as the engine (live from /api/tax-config, bundled fallback otherwise).
 */
export function BracketFiller() {
  const config = useTaxConfig();
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.35);
  const [filing, setFiling] = useState<FilingStatus>("married_filing_jointly");
  const [baseIncome, setBaseIncome] = useState(61_000);
  const [conversion, setConversion] = useState(0);
  const touched = useRef(false);

  const deduction = config.standard_deduction[filing];
  const brackets = config.brackets[filing];
  const baseTaxable = Math.max(0, baseIncome - deduction);

  /** Conversion needed to fill each bracket to the top. */
  const fillTargets = useMemo(
    () =>
      brackets
        .filter((b) => b.rate >= 0.12 && b.rate <= 0.24 && b.max !== null)
        .map((b) => ({ rate: b.rate, amount: Math.max(0, (b.max as number) - baseTaxable) })),
    [brackets, baseTaxable]
  );

  // Autoplay once on first view: pour conversions up to the top of 22%.
  useEffect(() => {
    if (!inView || touched.current) return;
    const target = fillTargets.find((t) => t.rate === 0.22)?.amount ?? 150_000;
    if (reduced) {
      setConversion(Math.round(target / 100) * 100);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1600;
    const step = (now: number) => {
      if (touched.current) return;
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setConversion(Math.round((target * eased) / 100) * 100);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // fillTargets intentionally omitted: autoplay should only run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced]);

  const totalTaxable = baseTaxable + conversion;
  const rows: Row[] = brackets
    .filter((b) => SHOWN_RATES.includes(b.rate))
    .map((b) => {
      const max = b.max ?? b.min + 500_000;
      const filled = (limit: number) => Math.max(0, Math.min(limit, max) - b.min);
      const base = filled(baseTaxable);
      return { rate: b.rate, capacity: max - b.min, base, converted: filled(totalTaxable) - base };
    });

  const tax =
    calculateFederalTax(baseIncome + conversion, filing, config) -
    calculateFederalTax(baseIncome, filing, config);
  const topRate = rows.filter((r) => r.converted > 0).pop()?.rate ?? 0;
  const effective = conversion > 0 ? tax / conversion : 0;

  const userSet = (fn: () => void) => {
    touched.current = true;
    fn();
  };

  return (
    <div
      ref={ref}
      className="rounded-[20px] border border-border bg-white px-5 py-6 shadow-[0_24px_60px_-34px_rgba(27,67,50,0.28)] sm:px-8 sm:py-8"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow">2026 brackets · one year · try it</span>
        <div
          className="inline-flex rounded-full border border-border bg-paper-warm p-1"
          role="group"
          aria-label="Filing status"
        >
          {(
            [
              ["married_filing_jointly", "Joint"],
              ["single", "Single"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filing === value}
              onClick={() => userSet(() => setFiling(value))}
              className={cn(
                "min-h-[30px] rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-200",
                filing === value
                  ? "bg-pine-deep text-[#f5f2ea]"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-[18px]">
        {rows.map((r) => {
          const basePct = (r.base / r.capacity) * 100;
          const convPct = (r.converted / r.capacity) * 100;
          const untouched = r.base === 0 && r.converted === 0;
          return (
            <div key={r.rate}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
                <b className="whitespace-nowrap font-semibold">{pct(r.rate)} bracket</b>
                <span className="text-right font-mono text-[11.5px] text-text-tertiary sm:text-[12.5px]">
                  {untouched ? (
                    r.rate >= 0.32 ? (
                      "$0, avoided"
                    ) : (
                      "untouched"
                    )
                  ) : (
                    <>
                      {r.base > 0 && `income ${formatCurrency(r.base)}`}
                      {r.base > 0 && r.converted > 0 && " · "}
                      {r.converted > 0 && (
                        <span className="text-pine-mid">
                          +{formatCurrency(r.converted)} converted
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="relative h-[30px] overflow-hidden rounded-[9px] bg-paper-warm">
                <div
                  className="absolute inset-y-0 left-0 bg-paper-stone"
                  style={{ width: `${basePct}%`, transition: `width 500ms ${EASE}` }}
                />
                <div
                  className="absolute inset-y-0 bg-gradient-to-r from-pine-mid to-sage"
                  style={{
                    left: `${basePct}%`,
                    width: `${convPct}%`,
                    borderRadius: basePct > 0 ? "0 9px 9px 0" : "9px",
                    transition: `width 500ms ${EASE}, left 500ms ${EASE}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 min-h-[2.6em] text-[13.5px] font-medium text-pine-mid">
        {conversion > 0 ? caption(topRate) : "Drag the slider to convert."}
      </p>

      {/* Totals */}
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <Stat value={formatCurrency(tax)} label="tax on conversion" />
        <Stat value={`${(effective * 100).toFixed(1)}%`} label="average rate" />
        <Stat value={conversion > 0 ? pct(topRate) : "n/a"} label="top bracket" />
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-col gap-5">
        <RangeControl
          label="Convert this year"
          value={conversion}
          min={0}
          max={MAX_CONVERSION}
          step={1000}
          onChange={(v) => userSet(() => setConversion(v))}
          display={formatCurrency(conversion)}
        />
        <RangeControl
          label="Other income (pension, part-time work)"
          value={baseIncome}
          min={0}
          max={200_000}
          step={1000}
          onChange={(v) => userSet(() => setBaseIncome(v))}
          display={formatCurrency(baseIncome)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-text-tertiary">Fill to the top of:</span>
          {fillTargets.map((t) => (
            <button
              key={t.rate}
              type="button"
              onClick={() =>
                userSet(() =>
                  setConversion(Math.min(MAX_CONVERSION, Math.round(t.amount / 100) * 100))
                )
              }
              className="min-h-[32px] rounded-full border border-border px-3.5 font-mono text-[12.5px] text-text-secondary transition-colors duration-200 hover:border-pine-mid hover:text-pine"
            >
              {pct(t.rate)}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-5 text-[12.5px] text-text-tertiary">
        Federal tax only, after the {formatCurrency(deduction)} standard deduction. Each green
        segment is conversion dollars placed in a bracket.
      </p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-white px-3 py-3 sm:px-4">
      <div className="font-serif text-[1.25rem] font-bold tabular-nums leading-tight text-pine sm:text-[1.45rem]">
        {value}
      </div>
      <div className="text-[12px] text-text-tertiary">{label}</div>
    </div>
  );
}
