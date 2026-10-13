"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/** Chart width in viewBox units; charts scale to their container. */
export const W = 600;
/** Gap between stacked or paired bars. */
export const GAP = 2;

export interface TooltipState {
  /** Horizontal position, percent of chart width. */
  x: number;
  title: string;
  lines: { label: string; value: string; color?: string }[];
}

export function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 18), 82);
  return (
    <div
      role="status"
      className="bg-pine-deep pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-[12px] px-3 py-2 text-[12px] text-[#f5f2ea] shadow-lg"
      style={{ left: `${left}%` }}
    >
      <div className="text-pine-haze font-mono text-[11px]">{tip.title}</div>
      {tip.lines.map((line) => (
        <div key={line.label} className="flex items-center gap-2 whitespace-nowrap">
          {line.color && (
            <span className="h-[2px] w-3 rounded" style={{ background: line.color }} />
          )}
          <span className="font-data font-semibold">{line.value}</span>
          <span className="text-pine-haze">{line.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="text-caption text-text-secondary flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={item.line ? "h-[2px] w-4 rounded" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

/** True when the user has asked the OS to minimize motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => (window.matchMedia ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false),
    () => false
  );
}

/**
 * Grow-in for chart marks: false until the chart scrolls into view (then true for
 * good), always true under reduced motion or without IntersectionObserver.
 */
export function useGrow() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setInView(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  return { ref, grown: inView || reduced, animate: !reduced };
}

/** A chart's title, legend, plot (with tooltip) and footnote. */
export function ChartBody({
  title,
  legend,
  tip,
  footer,
  children,
}: {
  title?: string;
  legend?: ReactNode;
  tip: TooltipState | null;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {title && <h3 className="text-h3 text-text-primary">{title}</h3>}
      {legend}
      <div className="relative">
        {children}
        <ChartTooltip tip={tip} />
      </div>
      {footer}
    </>
  );
}
