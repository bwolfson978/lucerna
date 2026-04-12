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
 * glassmorphic card wrapping the content.
 */
export function MethodologySection({
  id,
  number,
  title,
  children,
  className,
}: MethodologySectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-20", className)}
    >
      <div className="flex flex-col gap-comfortable">
        <div className="flex flex-col gap-tight">
          <span className="text-caption text-accent font-semibold font-ui">
            {number}
          </span>
          <h2 className="text-display md:text-display text-text-primary font-serif">
            {title}
          </h2>
        </div>
        <div className="card">
          <div className="flex flex-col gap-section">{children}</div>
        </div>
      </div>
    </section>
  );
}
