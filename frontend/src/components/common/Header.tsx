"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HowItWorksButton } from "@/components/methodology/HowItWorksButton";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-bg/80 backdrop-blur-md",
        "border-b border-border"
      )}
    >
      <div className="h-14 flex items-center px-default md:px-page">
        <div className="w-full max-w-content mx-auto flex items-center justify-between">
          <Link href="/" className="font-serif text-[18px] font-bold tracking-tight brand-gradient">
            Lucerna
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-5">
            <Link
              href="/demo"
              className="text-body-sm text-text-secondary hover:text-accent transition-colors duration-300"
            >
              Demo
            </Link>
            <span className="text-text-tertiary opacity-40">|</span>
            <Link
              href="/calculator"
              className="text-body-sm text-text-secondary hover:text-accent transition-colors duration-300"
            >
              Run Your Own Scenario
            </Link>
            <span className="text-text-tertiary opacity-40">|</span>
            <Link
              href="/methodology"
              className="text-body-sm text-text-secondary hover:text-accent transition-colors duration-300"
            >
              Methodology
            </Link>
            <HowItWorksButton />
          </nav>

          {/* Mobile: How It Works + hamburger */}
          <div className="flex sm:hidden items-center gap-2">
            <HowItWorksButton />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-text-secondary hover:text-text-primary transition-colors duration-200"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <nav className="sm:hidden border-t border-border bg-bg/95 backdrop-blur-md px-default py-3 flex flex-col gap-1">
          <Link
            href="/demo"
            onClick={() => setMobileMenuOpen(false)}
            className="text-body text-text-secondary hover:text-accent transition-colors duration-300 py-2.5 px-2 rounded-lg hover:bg-glass-bg"
          >
            Demo
          </Link>
          <Link
            href="/calculator"
            onClick={() => setMobileMenuOpen(false)}
            className="text-body text-text-secondary hover:text-accent transition-colors duration-300 py-2.5 px-2 rounded-lg hover:bg-glass-bg"
          >
            Run Your Own Scenario
          </Link>
          <Link
            href="/methodology"
            onClick={() => setMobileMenuOpen(false)}
            className="text-body text-text-secondary hover:text-accent transition-colors duration-300 py-2.5 px-2 rounded-lg hover:bg-glass-bg"
          >
            Methodology
          </Link>
        </nav>
      )}
    </header>
  );
}
