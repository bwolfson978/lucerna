"use client";

import type { CSSProperties, ElementType, ReactNode } from "react";
import { useInView } from "@/hooks/useInView";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  /** Stagger step (0 to 4), 100ms each. */
  delay?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className,
  style,
  id,
}: RevealProps) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref}
      id={id}
      data-visible={inView}
      className={cn("reveal", className)}
      style={{ transitionDelay: delay ? `${delay * 100}ms` : undefined, ...style }}
    >
      {children}
    </Tag>
  );
}
