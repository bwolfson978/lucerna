"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMethodology } from "./MethodologyContext";
import { AccordionSection } from "./AccordionSection";
import { getSections, getSectionLabel } from "./methodology-content";
import type { OptimizationResult } from "@/lib/types";

interface MethodologySidebarProps {
  result?: OptimizationResult;
  /** When true, renders as a fixed overlay (for mobile). Otherwise inline. */
  mobile?: boolean;
}

export function MethodologySidebar({ result, mobile }: MethodologySidebarProps) {
  const { isOpen, activeSection, activeTrigger, closeSidebar } =
    useMethodology();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const sections = getSections(result);

  // When activeSection changes (from a trigger click), expand it and collapse others
  useEffect(() => {
    if (activeSection) {
      setExpandedSections(new Set([activeSection]));
    } else if (isOpen) {
      setExpandedSections(new Set());
    }
  }, [activeSection, isOpen]);

  // Scroll to top when opened from header button (no active section)
  useEffect(() => {
    if (isOpen && !activeSection && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen, activeSection]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const sidebarContent = (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-6 py-6 methodology-scrollbar"
    >
      {/* Close button */}
      <button
        type="button"
        onClick={closeSidebar}
        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-md text-text-tertiary hover:bg-glass-bg hover:text-text-primary transition-all duration-200"
        aria-label="Close methodology sidebar"
      >
        &times;
      </button>

      {/* Header */}
      <h2 className="font-serif text-xl text-text-primary mb-1 pr-8">
        How It Works
      </h2>
      <p className="text-sm text-text-tertiary mb-5">
        Understand the analysis behind your results
      </p>

      {/* Context badge */}
      {activeTrigger && activeSection && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1 mb-4">
          <svg
            className="h-3 w-3"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 8h8M8 4v8" />
          </svg>
          Jumped to: {getSectionLabel(activeSection)}
        </div>
      )}

      {/* Accordion sections */}
      <div className="space-y-2">
        {sections.map((section) => (
          <AccordionSection
            key={section.id}
            id={section.id}
            title={section.title}
            open={expandedSections.has(section.id)}
            highlighted={activeSection === section.id}
            onToggle={() => toggleSection(section.id)}
          >
            {section.content}
          </AccordionSection>
        ))}
      </div>

      {/* Footer link */}
      <div className="mt-5 pt-4 border-t border-glass-border">
        <Link
          href="/methodology"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:opacity-80 transition-opacity"
        >
          Read our full methodology
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
        </Link>
      </div>
    </div>
  );

  // Mobile: fixed overlay with backdrop
  if (mobile) {
    return (
      <>
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-bg/70"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}
        <aside
          role="complementary"
          aria-label="How it works"
          className={cn(
            "fixed top-0 right-0 bottom-0 z-50",
            "w-full max-w-[420px]",
            "bg-bg-alt border-l border-glass-border",
            "transform transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            isOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  // Desktop: inline sticky sidebar within flex parent
  return (
    <aside
      role="complementary"
      aria-label="How it works"
      className={cn(
        "sticky top-14 h-[calc(100vh-3.5rem)]",
        "w-[400px] shrink-0",
        "bg-bg-alt border-l border-glass-border",
      )}
    >
      {sidebarContent}
    </aside>
  );
}
