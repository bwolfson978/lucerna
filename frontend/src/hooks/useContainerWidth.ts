import { useState, useEffect, type RefObject } from "react";

export function useContainerWidth(
  ref: RefObject<HTMLElement | null>
): number | undefined {
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentBoxSize[0].inlineSize);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
