import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

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
