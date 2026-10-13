"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

// useLayoutEffect warns during server rendering; nothing to measure there anyway.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The element's content width: measured before the first paint, then tracked with
 * ResizeObserver (undefined only before mount). Measuring up front keeps layouts that
 * branch on width from flashing their wide variant while the observer catches up.
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number | undefined {
  const [width, setWidth] = useState<number>();

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) || 0;
    setWidth(el.getBoundingClientRect().width - padding);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentBoxSize[0].inlineSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/** The window's inner height (undefined until mounted). */
export function useViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    function update() {
      setHeight(window.innerHeight);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return height;
}

/**
 * Marks `fadeRef` with data-scrolled-start / data-scrolled-end as `scrollRef` scrolls
 * horizontally (the `.scroll-fade` edges in tokens.css), and reports the first scroll.
 */
export function useScrollFade(
  scrollRef: RefObject<HTMLElement | null>,
  fadeRef: RefObject<HTMLElement | null>
): { hasScrolled: boolean } {
  const [hasScrolled, setHasScrolled] = useState(false);
  const hasScrolledRef = useRef(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    const fade = fadeRef.current;
    if (!el || !fade) return;

    const { scrollLeft, clientWidth, scrollWidth } = el;
    const canScroll = scrollWidth > clientWidth + 1;

    const atStart = !canScroll || scrollLeft <= 2;
    const atEnd = !canScroll || scrollLeft + clientWidth >= scrollWidth - 2;

    if (atStart) {
      fade.setAttribute("data-scrolled-start", "");
    } else {
      fade.removeAttribute("data-scrolled-start");
    }

    if (atEnd) {
      fade.setAttribute("data-scrolled-end", "");
    } else {
      fade.removeAttribute("data-scrolled-end");
    }
  }, [scrollRef, fadeRef]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    function onScroll() {
      if (!hasScrolledRef.current) {
        hasScrolledRef.current = true;
        setHasScrolled(true);
      }
      update();
    }

    // Set initial state
    update();

    scrollEl.addEventListener("scroll", onScroll, { passive: true });

    if (typeof ResizeObserver === "undefined") {
      return () => scrollEl.removeEventListener("scroll", onScroll);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [scrollRef, update]);

  return { hasScrolled };
}
