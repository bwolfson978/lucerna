"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

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

/**
 * An always-visible scroll track under a horizontally scrolling area. Native scrollbars
 * are hidden until use on macOS and in many iframes, so this shows from the first paint
 * that there is more to the right and how much. Drag the thumb or click the track; the
 * area itself still scrolls by trackpad, wheel and keyboard. Decorative to assistive tech.
 */
export function ScrollTrack({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 100, scrollable: false });
  const drag = useRef<{ x: number; scrollLeft: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const scrollable = scrollWidth > clientWidth + 1;
      const width = scrollable ? Math.max(12, (clientWidth / scrollWidth) * 100) : 100;
      const max = scrollWidth - clientWidth;
      const left = scrollable && max > 0 ? (scrollLeft / max) * (100 - width) : 0;
      setThumb({ left, width, scrollable });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [scrollRef]);

  if (!thumb.scrollable) return null;

  const ratio = () => {
    const el = scrollRef.current;
    const track = trackRef.current;
    return el && track ? el.scrollWidth / track.clientWidth : 1;
  };

  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      className="bg-paper-warm relative z-[2] mt-1 h-1.5 cursor-pointer rounded-full"
      onPointerDown={(e) => {
        const el = scrollRef.current;
        const track = trackRef.current;
        if (!el || !track || e.target !== track) return;
        // Click on the track: center the view on that point.
        const x = e.clientX - track.getBoundingClientRect().left;
        el.scrollTo({ left: x * ratio() - el.clientWidth / 2, behavior: "smooth" });
      }}
    >
      <div
        className="bg-pine-mid/45 hover:bg-pine-mid active:bg-pine absolute inset-y-0 cursor-grab touch-none rounded-full transition-colors active:cursor-grabbing"
        style={{ left: `${thumb.left}%`, width: `${thumb.width}%` }}
        onPointerDown={(e) => {
          const el = scrollRef.current;
          if (!el) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, scrollLeft: el.scrollLeft };
        }}
        onPointerMove={(e) => {
          const el = scrollRef.current;
          if (!el || !drag.current) return;
          el.scrollLeft = drag.current.scrollLeft + (e.clientX - drag.current.x) * ratio();
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
    </div>
  );
}
