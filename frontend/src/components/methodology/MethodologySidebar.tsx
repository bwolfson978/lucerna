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
  const { isOpen, activeSection, activeTrigger, activeQuestion, closeSidebar, askAbout } =
    useMethodology();
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
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 hover:bg-paper-deep hover:text-text-primary"
        aria-label="Close methodology sidebar"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Header */}
      <h2 className="mb-1 pr-10 font-serif text-xl text-text-primary">How It Works</h2>
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

      {/* Hand the question to the assistant */}
      {askAbout && activeSection && (
        <button
          type="button"
          onClick={() => {
            const question =
              activeQuestion ?? `How does "${getSectionLabel(activeSection)}" apply to my results?`;
            closeSidebar();
            askAbout(question);
          }}
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-[14px] border border-pine-mid/25 bg-white px-4 py-3 text-left text-sm font-medium text-pine transition-colors duration-200 hover:border-pine-mid"
        >
          <span>Ask about this in the conversation</span>
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M6 4l4 4-4 4" />
          </svg>
        </button>
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
        "sticky top-[68px] h-[calc(100vh-68px)]",
        "w-[400px] shrink-0",
        "border-l border-glass-border bg-bg-alt"
      )}
    >
      {sidebarContent}
    </aside>
  );
}
