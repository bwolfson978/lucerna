"use client";

import { cn } from "@/lib/utils";

interface MethodologySectionProps {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper for each section on the methodology page.
 * Provides consistent structure: section number badge, title, and
 * white card wrapping the content.
 */
export function MethodologySection({
  id,
  number,
  title,
  children,
  className,
}: MethodologySectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-28", className)}>
      <div className="flex flex-col gap-comfortable">
        <div className="flex flex-col gap-tight">
          <span className="font-mono text-[13px] tracking-[0.1em] text-pine-mid">{number}</span>
          <h2 className="display-heading text-[clamp(1.9rem,3.4vw,2.6rem)]">{title}</h2>
        </div>
        <div className="card">
          <div className="flex flex-col gap-section">{children}</div>
        </div>
      </div>
    </section>
  );
}
