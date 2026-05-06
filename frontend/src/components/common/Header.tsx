"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HowItWorksButton } from "@/components/methodology/HowItWorksButton";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Only close the menu explicitly when tapping the current page's link —
  // cross-page navigation unmounts this component, so the menu resets naturally.
  // Closing on cross-page clicks causes a flash: the scrim disappears before
  // the new page loads, briefly exposing the current page without the overlay.
  const handleNavClick = (href: string) => {
    if (pathname === href) setMobileMenuOpen(false);
  };

  return (
    <>
      <header
        className={cn("sticky top-0 z-40 bg-bg/80 backdrop-blur-md", "border-b border-border")}
      >
        <div className="flex h-14 items-center px-default md:px-page">
          <div className="mx-auto flex w-full max-w-content items-center justify-between">
            <Link
              href="/"
              className="brand-gradient font-serif text-[18px] font-bold tracking-tight"
              aria-label="Home"
            >
              <svg
                width="22"
                height="28"
                viewBox="0 0 22 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M11 2C11 2 5 8.5 5 14.5C5 18.09 7.69 21 11 21C14.31 21 17 18.09 17 14.5C17 8.5 11 2 11 2Z"
                  fill="#F0C674"
                  fillOpacity="0.9"
                />
                <path
                  d="M11 14C11 14 8.5 11 8.5 14.5C8.5 15.88 9.62 17 11 17C12.38 17 13.5 15.88 13.5 14.5C13.5 11 11 14 11 14Z"
                  fill="#1a1510"
                />
                <rect x="9.5" y="21" width="3" height="5" rx="1.5" fill="#F0C674" fillOpacity="0.5" />
              </svg>
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
              onClick={() => handleNavClick("/demo")}
              className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-300 hover:bg-glass-bg hover:text-accent"
            >
              Demo
            </Link>
            <Link
              href="/calculator"
              onClick={() => handleNavClick("/calculator")}
              className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-300 hover:bg-glass-bg hover:text-accent"
            >
              Run Your Own Scenario
            </Link>
            <Link
              href="/methodology"
              onClick={() => handleNavClick("/methodology")}
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
