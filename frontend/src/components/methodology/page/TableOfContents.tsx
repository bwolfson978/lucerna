"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  number: string;
  title: string;
}

interface TableOfContentsProps {
  items: TocItem[];
  activeId: string | null;
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/**
 * Desktop: sticky left sidebar with section links.
 * Mobile: slim sticky bar with dropdown.
 */
export function TableOfContents({ items, activeId }: TableOfContentsProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeItem = items.find((item) => item.id === activeId);

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        className="hidden lg:block sticky top-20 h-fit w-[240px] shrink-0"
        aria-label="Table of contents"
      >
        <div className="card !p-4 !rounded-lg">
          <h3 className="text-caption font-ui text-text-tertiary uppercase tracking-wider mb-3">
            On this page
          </h3>
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-body-sm transition-all duration-200",
                    "hover:bg-glass-bg-hover",
                    activeId === item.id
                      ? "text-accent border-l-2 border-accent bg-accent-muted"
                      : "text-text-secondary"
                  )}
                >
                  <span className="font-mono text-[11px] text-text-tertiary mr-2">
                    {item.number}
                  </span>
                  {item.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile sticky bar */}
      <div className="lg:hidden sticky top-14 z-30 bg-bg/90 backdrop-blur-md border-b border-border">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full flex items-center justify-between px-default py-2.5 min-h-[44px]"
        >
          <span className="text-body-sm text-text-secondary truncate">
            {activeItem ? (
              <>
                <span className="font-mono text-[11px] text-text-tertiary mr-1.5">
                  {activeItem.number}
                </span>
                {activeItem.title}
              </>
            ) : (
              "On this page"
            )}
          </span>
          <svg
            className={cn(
              "h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200",
              mobileOpen && "rotate-180"
            )}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>

        {/* Dropdown */}
        {mobileOpen && (
          <div className="absolute top-full left-0 right-0 bg-bg-alt/95 backdrop-blur-md border-b border-border shadow-elevated px-default py-2 z-40">
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      scrollToSection(item.id);
                      setMobileOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-body-sm transition-all duration-200 min-h-[44px]",
                      activeId === item.id
                        ? "text-accent bg-accent-muted"
                        : "text-text-secondary hover:bg-glass-bg"
                    )}
                  >
                    <span className="font-mono text-[11px] text-text-tertiary mr-2">
                      {item.number}
                    </span>
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
