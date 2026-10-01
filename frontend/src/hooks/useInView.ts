import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Reports when an element first scrolls into view. Fires once, then stops
 * observing. Falls back to "visible" when IntersectionObserver is missing
 * (old browsers, jsdom) so content is never stuck hidden.
 */
export function useInView<T extends Element = HTMLDivElement>(
  threshold = 0.18
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

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
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, inView]);

  return [ref, inView];
}

// Shared with the cards in ui/ (also rendered inside MCP App Views).
export { usePrefersReducedMotion } from "@lucerna/ui";
