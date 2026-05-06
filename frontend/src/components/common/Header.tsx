"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HowItWorksButton } from "@/components/methodology/HowItWorksButton";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
    <header className={cn("sticky top-0 z-40 bg-bg/80 backdrop-blur-md", "border-b border-border")}>
      <div className="flex h-14 items-center px-default md:px-page">
        <div className="mx-auto flex w-full max-w-content items-center justify-between">
          <Link href="/" className="brand-gradient font-serif text-[18px] font-bold tracking-tight">
            Lucerna
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-5 sm:flex">
            <Link
              href="/demo"
              className="text-body-sm text-text-secondary transition-colors duration-300 hover:text-accent"
            >
              Demo
            </Link>
            <span className="text-text-tertiary opacity-40">|</span>
            <Link
              href="/calculator"
              className="text-body-sm text-text-secondary transition-colors duration-300 hover:text-accent"
            >
              Run Your Own Scenario
            </Link>
            <span className="text-text-tertiary opacity-40">|</span>
            <Link
              href="/methodology"
              className="text-body-sm text-text-secondary transition-colors duration-300 hover:text-accent"
            >
              Methodology
            </Link>
            <HowItWorksButton />
          </nav>

          {/* Mobile: How It Works + hamburger */}
          <div className="flex items-center gap-2 sm:hidden">
            <HowItWorksButton />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors duration-200 hover:text-text-primary"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu — absolute so it overlays content instead of pushing it down */}
      {mobileMenuOpen && (
        <nav className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-border bg-bg px-default py-3 shadow-elevated sm:hidden">
          <Link
            href="/demo"
            className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-300 hover:bg-glass-bg hover:text-accent"
          >
            Demo
          </Link>
          <Link
            href="/calculator"
            className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-300 hover:bg-glass-bg hover:text-accent"
          >
            Run Your Own Scenario
          </Link>
          <Link
            href="/methodology"
            className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-300 hover:bg-glass-bg hover:text-accent"
          >
            Methodology
          </Link>
        </nav>
      )}
    </header>
    {/* Scrim — covers page content behind the mobile menu, closes on tap */}
    {mobileMenuOpen && (
      <div
        className="fixed inset-0 z-[39] bg-bg/85 sm:hidden"
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
    )}
    </>
  );
}
