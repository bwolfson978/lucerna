import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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

    const observer = new ResizeObserver(() => update());
    observer.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [scrollRef, update]);

  return { hasScrolled };
}
