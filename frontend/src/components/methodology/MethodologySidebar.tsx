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
  const { isOpen, activeSection, activeTrigger, closeSidebar } = useMethodology();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
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
    <div ref={scrollRef} className="methodology-scrollbar h-full overflow-y-auto px-6 py-6">
      {/* Close button */}
      <button
        type="button"
        onClick={closeSidebar}
        className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-all duration-200 hover:bg-glass-bg hover:text-text-primary"
        aria-label="Close methodology sidebar"
      >
        &times;
      </button>

      {/* Header */}
      <h2 className="mb-1 pr-8 font-serif text-xl text-text-primary">How It Works</h2>
      <p className="mb-5 text-sm text-text-tertiary">Understand the analysis behind your results</p>

      {/* Context badge */}
      {activeTrigger && activeSection && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent">
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
      <div className="mt-5 border-t border-glass-border pt-4">
        <Link
          href="/methodology"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity hover:opacity-80"
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
          <div className="fixed inset-0 z-40 bg-bg/85" onClick={closeSidebar} aria-hidden="true" />
        )}
        <aside
          role="complementary"
          aria-label="How it works"
          className={cn(
            "fixed bottom-0 right-0 top-0 z-50",
            "w-full max-w-[420px]",
            "border-l border-glass-border bg-bg-alt",
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
        "border-l border-glass-border bg-bg-alt"
      )}
    >
      {sidebarContent}
    </aside>
  );
}
