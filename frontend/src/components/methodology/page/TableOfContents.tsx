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
        className="sticky top-20 hidden h-fit w-[240px] shrink-0 lg:block"
        aria-label="Table of contents"
      >
        <div className="card !rounded-lg !p-4">
          <h3 className="mb-3 font-ui text-caption uppercase tracking-wider text-text-tertiary">
            On this page
          </h3>
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-left text-body-sm transition-all duration-200",
                    "hover:bg-glass-bg-hover",
                    activeId === item.id
                      ? "border-l-2 border-accent bg-accent-muted text-accent"
                      : "text-text-secondary"
                  )}
                >
                  <span className="mr-2 font-mono text-[11px] text-text-tertiary">
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
      <div className="sticky top-14 z-30 border-b border-border bg-bg/90 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex min-h-[44px] w-full items-center justify-between px-default py-2.5"
        >
          <span className="truncate text-body-sm text-text-secondary">
            {activeItem ? (
              <>
                <span className="mr-1.5 font-mono text-[11px] text-text-tertiary">
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
          <div className="absolute left-0 right-0 top-full z-40 border-b border-border bg-bg-alt/95 px-default py-2 shadow-elevated backdrop-blur-md">
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
                      "min-h-[44px] w-full rounded-lg px-3 py-2.5 text-left text-body-sm transition-all duration-200",
                      activeId === item.id
                        ? "bg-accent-muted text-accent"
                        : "text-text-secondary hover:bg-glass-bg"
                    )}
                  >
                    <span className="mr-2 font-mono text-[11px] text-text-tertiary">
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

      {/* Scrim — dims page content behind the dropdown, closes on tap */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[29] bg-bg/85 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
