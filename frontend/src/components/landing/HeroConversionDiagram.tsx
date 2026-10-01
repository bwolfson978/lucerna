"use client";

import { useEffect, useState } from "react";
import { useInView, usePrefersReducedMotion } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

const BALANCE = 1_400_000;
const FILL_MS = 9000;
const HOLD_MS = 2600;
const CYCLE_MS = FILL_MS + HOLD_MS;

/** Bracket the conversion is "in" at a given point of the illustration. */
const STAGES = [
  { rate: "12%", until: 0.3 },
  { rate: "22%", until: 0.68 },
  { rate: "24%", until: 1.01 },
] as const;

function formatMillions(n: number): string {
  if (n >= 995_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(n / 1000)}K`;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * Hero illustration: dollars flow from a Traditional IRA into a Roth IRA,
 * filling the low brackets in order and never touching 32%.
 * Purely illustrative; no engine output is shown here.
 */
export function HeroConversionDiagram() {
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const reduced = usePrefersReducedMotion();
  const [animatedProgress, setProgress] = useState(0);
  // With reduced motion, hold a static mid-conversion frame instead of looping.
  const progress = reduced ? 0.55 : animatedProgress;

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) % CYCLE_MS;
      setProgress(t < FILL_MS ? easeInOut(t / FILL_MS) : 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced]);

  const converted = BALANCE * progress;
  const remaining = BALANCE - converted;
  const stageIndex = STAGES.findIndex((s) => progress < s.until);

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Illustration: money moves from a Traditional IRA to a Roth IRA, paying tax once at today's lower rates and filling the 12%, 22% and 24% brackets while avoiding 32%."
      className="relative rounded-[20px] border border-border bg-white px-5 pb-6 pt-6 shadow-[0_24px_60px_-30px_rgba(27,67,50,0.25)] sm:px-7 sm:pt-7"
    >
      <div className="eyebrow mb-5">The core move · live illustration</div>

      <div className="relative grid grid-cols-1 items-center gap-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(170px,1.15fr)_minmax(0,0.9fr)]">
        {/* Traditional */}
        <AccountCard
          tone="light"
          title="Traditional IRA"
          subtitle="tax-deferred"
          amount={formatMillions(remaining)}
          footnote="every dollar taxed later"
          fill={1 - progress}
        />

        {/* Connector */}
        <div className="relative flex h-[132px] items-center justify-center sm:h-[190px]">
          {/* horizontal flow (tablet and up) */}
          <svg
            viewBox="0 0 160 20"
            className="absolute inset-x-0 top-1/2 hidden w-full -translate-y-1/2 overflow-visible sm:block"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="heroFlowH" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#2d6a4f" />
                <stop offset="1" stopColor="#66a183" />
              </linearGradient>
            </defs>
            <path
              id="heroPathH"
              className="flow-path"
              d="M 2 10 L 158 10"
              fill="none"
              stroke="url(#heroFlowH)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <FlowDots pathId="heroPathH" active={inView && !reduced} />
            <circle className="pulse-ring" cx="2" cy="10" r="7" fill="#2d6a4f" opacity=".45" />
            <circle cx="2" cy="10" r="5" fill="#2d6a4f" />
            <circle
              className="pulse-ring"
              cx="158"
              cy="10"
              r="7"
              fill="#66a183"
              opacity=".45"
              style={{ animationDelay: "1.3s" }}
            />
            <circle cx="158" cy="10" r="5" fill="#66a183" />
          </svg>

          {/* vertical flow (phones) */}
          <svg
            viewBox="0 0 20 120"
            className="absolute inset-y-0 left-1/2 h-full -translate-x-1/2 overflow-visible sm:hidden"
            aria-hidden="true"
          >
            <path
              id="heroPathV"
              className="flow-path"
              d="M 10 4 L 10 116"
              fill="none"
              stroke="#2d6a4f"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <FlowDots pathId="heroPathV" active={inView && !reduced} />
          </svg>

          <Chip
            className="left-[calc(50%+20px)] top-3 sm:left-1/2 sm:top-2 sm:-translate-x-1/2"
            dotClass="bg-sage"
            delay="2.2s"
          >
            at today&apos;s low rate
          </Chip>
          <Chip
            className="bottom-3 right-[calc(50%+20px)] sm:bottom-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
            dotClass="bg-ember"
            borderClass="border-ember"
          >
            tax paid once
          </Chip>
        </div>

        {/* Roth */}
        <AccountCard
          tone="dark"
          title="Roth IRA"
          subtitle="tax-free growth"
          amount={formatMillions(converted)}
          footnote="$0 future tax"
          fill={progress}
        />
      </div>

      {/* Bracket meter */}
      <div
        className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-[12px] tracking-[0.12em] text-text-tertiary"
        aria-hidden="true"
      >
        {STAGES.map((s, i) => (
          <span key={s.rate} className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 transition-colors duration-500",
                i === stageIndex && "bg-accent-light font-medium text-pine",
                i < stageIndex && "text-pine-mid"
              )}
            >
              {s.rate}
            </span>
            {i < STAGES.length - 1 && <span>&rarr;</span>}
          </span>
        ))}
        <span className="px-1">·</span>
        <span className="text-ember line-through decoration-1">never 32%</span>
      </div>
    </div>
  );
}

function AccountCard({
  tone,
  title,
  subtitle,
  amount,
  footnote,
  fill,
}: {
  tone: "light" | "dark";
  title: string;
  subtitle: string;
  amount: string;
  footnote: string;
  fill: number;
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl px-3 py-5 text-center",
        dark ? "bg-pine-deep text-[#f5f2ea]" : "border border-border bg-paper-warm"
      )}
    >
      <div className={cn("text-[14px] font-bold", dark ? "text-[#f5f2ea]" : "text-text-primary")}>
        {title}
      </div>
      <div className={cn("text-[12px]", dark ? "text-pine-mist" : "text-text-tertiary")}>
        {subtitle}
      </div>
      <div
        className={cn(
          "mt-3 font-serif text-[30px] font-bold tabular-nums leading-none",
          dark ? "text-white" : "text-pine"
        )}
      >
        {amount}
      </div>
      <div className={cn("mt-2 text-[11px]", dark ? "text-pine-mist" : "text-text-tertiary")}>
        {footnote}
      </div>
      {/* balance gauge */}
      <div
        className={cn(
          "mx-auto mt-4 h-1.5 w-full max-w-[150px] overflow-hidden rounded-full",
          dark ? "bg-white/10" : "bg-paper-deep"
        )}
      >
        <div
          className={cn("h-full rounded-full", dark ? "bg-sage" : "bg-paper-stone")}
          style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Chip({
  children,
  className,
  dotClass,
  borderClass = "border-border",
  delay,
}: {
  children: React.ReactNode;
  className?: string;
  dotClass: string;
  borderClass?: string;
  delay?: string;
}) {
  // Outer div positions (may use translate); inner div bobs (animation owns its transform).
  return (
    <div className={cn("absolute z-10", className)}>
      <div
        className={cn(
          "float-chip flex items-center gap-2 whitespace-nowrap rounded-full border bg-white px-3.5 py-2 text-[12.5px] font-semibold text-text-primary shadow-[0_8px_20px_-12px_rgba(20,20,20,0.25)]",
          borderClass
        )}
        style={delay ? { animationDelay: delay } : undefined}
      >
        <span className={cn("h-2.5 w-2.5 flex-none rounded-full", dotClass)} />
        {children}
      </div>
    </div>
  );
}

/** Small "coins" travelling along the connector path. */
function FlowDots({ pathId, active }: { pathId: string; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {[0, 0.6, 1.2].map((begin) => (
        <circle key={begin} r="3.5" fill="#f5f2ea" stroke="#2d6a4f" strokeWidth="1.5">
          <animateMotion dur="1.8s" repeatCount="indefinite" begin={`${-begin}s`}>
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}
