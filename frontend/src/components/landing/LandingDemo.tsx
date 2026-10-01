"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDemo } from "@/hooks/useDemo";
import { useInView, usePrefersReducedMotion } from "@/hooks/useInView";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils/formatting";
import type { DemoResponse } from "@/lib/types";
import { Reveal } from "@/components/common/Reveal";
import { cn } from "@/lib/utils";

const VISIBLE_ROWS = 8;

interface ScheduleRow {
  year: number;
  age: number;
  conversion: number;
  bracket: string;
  tax: number;
}

function toBracketLabel(b: string | number): string {
  if (typeof b === "number") return `${Math.round(b <= 1 ? b * 100 : b)}%`;
  return b;
}

function bracketValue(label: string): number {
  return parseFloat(label) || 0;
}

/** Derives the landing-page numbers from the engine's Margaret demo result. */
function summarize(demo: DemoResponse) {
  const { result } = demo;
  const rows: ScheduleRow[] = result.yearly_detail
    .map((d, i) => ({
      year: d.year,
      age: result.input.age + i,
      conversion: d.conversion,
      bracket: toBracketLabel(d.marginal_bracket),
      tax: d.tax_cost,
    }))
    .filter((r) => r.conversion > 0);
  const topBracket = rows.reduce(
    (top, r) => (bracketValue(r.bracket) > bracketValue(top) ? r.bracket : top),
    "0%"
  );
  return {
    rows,
    savings: result.estimated_lifetime_tax_savings,
    totalConverted: result.total_conversion,
    totalTax: result.total_tax_on_conversions,
    topBracket,
  };
}

/** Sections 03 (conversion register) and the Margaret spotlight, both fed by /api/demo. */
export function LandingDemo() {
  const state = useDemo();
  const summary = state.status === "ready" ? summarize(state.demo) : null;

  return (
    <>
      <section id="schedule" className="px-default py-[72px] sm:px-7 lg:py-[110px]">
        <div className="mx-auto max-w-wide">
          <div className="mb-12 max-w-[640px]">
            <Reveal
              as="span"
              className="mb-3.5 block font-mono text-[13px] tracking-[0.1em] text-sage"
            >
              03
            </Reveal>
            <Reveal as="h2" delay={1} className="display-heading mb-5 text-display">
              A schedule you
              <br />
              can <em>act on.</em>
            </Reveal>
            <Reveal
              as="p"
              delay={2}
              className="text-[1.08rem] leading-relaxed text-text-secondary sm:text-[1.2rem]"
            >
              See how conversions fill your brackets year by year. Adjust anything (income, amounts,
              assumptions) and watch the impact in real time. Understand the tradeoffs, then plan
              with confidence.
            </Reveal>
          </div>
          <ConversionRegister state={state.status} summary={summary} />
        </div>
      </section>

      <section id="scenario" className="px-default pb-[72px] sm:px-7 lg:pb-[110px]">
        <div className="mx-auto max-w-wide">
          <Reveal className="grid grid-cols-1 items-center gap-10 rounded-[26px] bg-paper-warm px-6 py-10 sm:px-10 lg:grid-cols-2 lg:gap-14 lg:p-[60px]">
            <div>
              <span className="mb-4 block font-mono text-[11px] uppercase tracking-[0.2em] text-pine-mid">
                Demo scenario
              </span>
              <h3 className="display-heading mb-4 text-[clamp(1.7rem,3vw,2.5rem)] leading-[1.15]">
                Margaret, 63. The window is open <em>right now.</em>
              </h3>
              <p className="mb-3.5 text-text-secondary">
                Registered nurse, retired last year.{" "}
                <strong className="text-text-primary">$1.4M</strong> in a traditional 401(k), no
                Social Security yet, and about a decade before required minimum distributions force
                six-figure taxable income.
              </p>
              <p className="mb-3.5 text-text-secondary">
                {summary
                  ? `The optimized schedule converts through her lowest-tax years, keeping every conversion dollar at ${summary.topBracket} or below.`
                  : "The optimized schedule converts through her lowest-tax years, before RMDs take the choice away."}
              </p>
              <Link href="/demo" className="link-arrow mt-2">
                View full analysis <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
              <SpotStat
                value={summary ? formatCurrency(summary.savings) : null}
                label="estimated lifetime tax savings vs. not converting"
                failed={state.status === "error"}
              />
              <SpotStat
                value={summary ? `${summary.rows.length} years` : null}
                label="of scheduled conversions"
                failed={state.status === "error"}
              />
              <SpotStat
                value={summary ? formatCompactCurrency(summary.totalConverted) : null}
                label="moved from traditional to Roth"
                failed={state.status === "error"}
              />
              <SpotStat
                value={summary ? summary.topBracket : null}
                label="highest bracket any conversion reaches"
                failed={state.status === "error"}
              />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function SpotStat({
  value,
  label,
  failed,
}: {
  value: string | null;
  label: string;
  failed: boolean;
}) {
  return (
    <div className="bg-white px-5 py-6 sm:px-6">
      {value ? (
        <div className="font-serif text-[1.55rem] font-bold tabular-nums text-pine sm:text-[1.9rem]">
          {value}
        </div>
      ) : failed ? (
        <div className="font-serif text-[1.55rem] font-bold text-text-tertiary sm:text-[1.9rem]">
          n/a
        </div>
      ) : (
        <div className="h-[2.1rem] w-28 animate-pulse rounded-md bg-paper-deep sm:h-[2.4rem]" />
      )}
      <div className="mt-1 text-[13px] leading-snug text-text-tertiary">{label}</div>
    </div>
  );
}

function ConversionRegister({
  state,
  summary,
}: {
  state: "loading" | "ready" | "error";
  summary: ReturnType<typeof summarize> | null;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  const reduced = usePrefersReducedMotion();
  const [tickedCount, setShownCount] = useState(0);
  const [countedSaved, setSaved] = useState(0);
  const live = inView && summary !== null;
  // Reduced motion skips the count-up and shows final values.
  const shownCount = reduced ? (summary?.rows.length ?? 0) : tickedCount;
  const saved = reduced ? (summary?.savings ?? 0) : countedSaved;

  // Tick the "N of M years scheduled" counter and count up the savings figure.
  useEffect(() => {
    if (!live || !summary || reduced) return;
    const total = summary.rows.length;
    let n = 0;
    const tick = window.setInterval(() => {
      n += 1;
      setShownCount(n);
      if (n >= total) window.clearInterval(tick);
    }, 90);
    let raf = 0;
    const t0 = performance.now();
    const dur = 2200;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setSaved(summary.savings * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      window.clearInterval(tick);
      cancelAnimationFrame(raf);
    };
  }, [live, summary, reduced]);

  const rows = summary?.rows ?? [];
  const visible = rows.slice(0, VISIBLE_ROWS);
  const rest = rows.slice(VISIBLE_ROWS);
  const restConverted = rest.reduce((s, r) => s + r.conversion, 0);
  const restTax = rest.reduce((s, r) => s + r.tax, 0);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-[26px] bg-pine-deep px-5 py-9 text-[#efece2] sm:px-[50px] sm:py-[54px]"
    >
      <div className="dark-wash" />
      <div className="relative mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-serif text-[1.7rem] font-semibold">Conversion register</h3>
        <span className="font-mono text-[13.5px] tracking-[0.06em] text-sage">
          {summary
            ? `${Math.min(shownCount, rows.length)} of ${rows.length} years scheduled`
            : state === "error"
              ? "demo unavailable"
              : "loading Margaret's schedule"}
        </span>
      </div>
      <p className="relative text-[13.5px] text-pine-mist">
        Margaret&apos;s optimized schedule, computed live by the optimization engine.
      </p>

      <div className="relative -mx-1 mt-5">
        <table className="w-full border-collapse text-[13px] sm:text-[14.5px]">
          <thead>
            <tr>
              {["Year", "Convert", "Bracket", "Tax that year", "Status"].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "border-b border-pine-line px-1.5 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-pine-mist sm:px-2.5",
                    i === 4 && "hidden sm:table-cell"
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state === "loading" &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={5} className="sm:px-2.5.5 border-b border-white/[0.07] px-1.5 py-3">
                    <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.06]" />
                  </td>
                </tr>
              ))}
            {state === "error" && (
              <tr>
                <td colSpan={5} className="px-1.5 py-6 text-pine-haze sm:px-2.5">
                  The live demo is unavailable right now.{" "}
                  <Link href="/calculator" className="font-semibold text-white underline">
                    Run your own scenario
                  </Link>{" "}
                  instead.
                </td>
              </tr>
            )}
            {visible.map((r, i) => (
              <tr
                key={r.year}
                className="transition-[opacity,transform] duration-500 ease-out"
                style={{
                  opacity: live ? 1 : 0,
                  transform: live ? "none" : "translateX(-14px)",
                  transitionDelay: `${i * 110}ms`,
                }}
              >
                <td className="border-b border-white/[0.07] px-1.5 py-3 font-mono sm:px-2.5">
                  {r.year}
                  <span className="ml-2 hidden text-[12px] text-pine-mist sm:inline">
                    age {r.age}
                  </span>
                </td>
                <td className="border-b border-white/[0.07] px-1.5 py-3 tabular-nums sm:px-2.5">
                  {formatCurrency(r.conversion)}
                </td>
                <td className="border-b border-white/[0.07] px-1.5 py-3 sm:px-2.5">{r.bracket}</td>
                <td className="border-b border-white/[0.07] px-1.5 py-3 tabular-nums sm:px-2.5">
                  {formatCurrency(r.tax)}
                </td>
                <td className="hidden border-b border-white/[0.07] px-1.5 py-3 sm:table-cell sm:px-2.5">
                  <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-sage">
                    <span className="blink-dot h-2 w-2 rounded-full bg-sage" />
                    Scheduled
                  </span>
                </td>
              </tr>
            ))}
            {rest.length > 0 && (
              <tr
                className="transition-opacity duration-500"
                style={{ opacity: live ? 1 : 0, transitionDelay: `${visible.length * 110}ms` }}
              >
                <td className="px-1.5 py-3 font-mono text-pine-mist sm:px-2.5">
                  +{rest.length} more
                </td>
                <td className="px-1.5 py-3 tabular-nums text-pine-mist sm:px-2.5">
                  {formatCurrency(restConverted)}
                </td>
                <td className="px-1.5 py-3 text-pine-mist sm:px-2.5">
                  {rest[0].year} to {rest[rest.length - 1].year}
                </td>
                <td className="px-1.5 py-3 tabular-nums text-pine-mist sm:px-2.5">
                  {formatCurrency(restTax)}
                </td>
                <td className="hidden px-1.5 py-3 sm:table-cell sm:px-2.5" />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="relative mt-8 flex flex-wrap items-center justify-between gap-5">
        <div>
          <div className="text-[14.5px] text-pine-haze">
            Estimated lifetime tax savings vs. not converting
          </div>
          <div className="font-serif text-[clamp(2.4rem,4vw,3.4rem)] font-bold tabular-nums text-white">
            {summary ? formatCurrency(Math.round(saved)) : "$..."}{" "}
            <small className="font-sans text-base font-medium text-pine-mist">
              today&apos;s dollars
            </small>
          </div>
        </div>
        <Link href="/calculator" className="btn-paper">
          Get my schedule
        </Link>
      </div>
    </div>
  );
}
