import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Synchronizes horizontal scroll position across multiple scrollable elements.
 * When one scrolls, all others follow to the same scrollLeft pixel offset.
 */
export function useSyncedScroll(...refs: RefObject<HTMLElement | null>[]): void {
  const scrollingRef = useRef<HTMLElement | null>(null);
  // Force re-run after mount when refs are populated
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const elements = refs.map((r) => r.current).filter(Boolean) as HTMLElement[];
    if (elements.length < 2) return;

    function onScroll(e: Event) {
      const source = e.target as HTMLElement;

      // If another element initiated the scroll, don't propagate
      if (scrollingRef.current && scrollingRef.current !== source) return;

      scrollingRef.current = source;
      const { scrollLeft } = source;

      for (const el of elements) {
        if (el !== source && Math.abs(el.scrollLeft - scrollLeft) > 1) {
          el.scrollLeft = scrollLeft;
        }
      }

      // Release the guard after the browser has finished layout
      requestAnimationFrame(() => {
        scrollingRef.current = null;
      });
    }

    for (const el of elements) {
      el.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      for (const el of elements) {
        el.removeEventListener("scroll", onScroll);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
}
