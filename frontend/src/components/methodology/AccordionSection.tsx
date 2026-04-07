"use client";

import { useEffect, useRef } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface AccordionSectionProps {
  id: string;
  title: string;
  open: boolean;
  highlighted?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function AccordionSection({
  id,
  title,
  open,
  highlighted = false,
  onToggle,
  children,
}: AccordionSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted && ref.current && ref.current.scrollIntoView) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlighted]);

  return (
    <div ref={ref} id={`methodology-${id}`}>
      <Collapsible open={open} onOpenChange={onToggle}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center justify-between px-4 py-3.5",
            "bg-glass-bg border border-glass-border rounded-lg",
            "text-sm font-medium text-text-primary text-left",
            "transition-all duration-200",
            "hover:bg-[rgba(255,255,255,0.06)]",
            open && "text-accent",
            highlighted && "border-accent/35 shadow-[0_0_12px_rgba(240,198,116,0.08)]"
          )}
        >
          {title}
          <svg
            className={cn(
              "h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200",
              open && "rotate-180"
            )}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </CollapsibleTrigger>
        <CollapsibleContent className="methodology-accordion-content overflow-hidden">
          <div className="px-4 pt-1 pb-4 space-y-3">
            {children}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
