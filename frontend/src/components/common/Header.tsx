"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { HowItWorksButton } from "@/components/methodology/HowItWorksButton";
import { Wordmark } from "@/components/common/Wordmark";

const NAV_LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/methodology", label: "Methodology" },
] as const;

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isSignedIn } = useUser();

  // Only close the menu explicitly when tapping the current page's link —
  // cross-page navigation unmounts this component, so the menu resets naturally.
  // Closing on cross-page clicks causes a flash: the scrim disappears before
  // the new page loads, briefly exposing the current page without the overlay.
  const handleNavClick = (href: string) => {
    if (pathname === href) setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-paper/80 backdrop-blur-[14px]">
        <div className="mx-auto flex h-[68px] w-full max-w-wide items-center justify-between gap-4 px-default sm:px-7">
          <Wordmark />

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 sm:flex" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cn(
                  "text-[15px] font-medium transition-colors duration-200 hover:text-text-primary",
                  pathname === link.href ? "text-pine" : "text-text-secondary"
                )}
              >
                {link.label}
              </Link>
            ))}
            {isSignedIn && (
              <Link
                href="/my-scenarios"
                aria-current={pathname === "/my-scenarios" ? "page" : undefined}
                className={cn(
                  "text-[15px] font-medium transition-colors duration-200 hover:text-text-primary",
                  pathname === "/my-scenarios" ? "text-pine" : "text-text-secondary"
                )}
              >
                My scenarios
              </Link>
            )}
            <HowItWorksButton />
            <Link href="/calculator" className="btn-dark min-h-[40px] px-6 py-2.5 text-[14.5px]">
              Run your scenario
            </Link>
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 sm:hidden">
            <HowItWorksButton />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 hover:text-text-primary"
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

        {/* Mobile dropdown menu — absolute so it overlays content instead of pushing it down */}
        {mobileMenuOpen && (
          <nav
            className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-border bg-paper px-default py-3 shadow-elevated sm:hidden"
            aria-label="Mobile"
          >
            {[{ href: "/", label: "Home" }, ...NAV_LINKS].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => handleNavClick(link.href)}
                className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
              >
                {link.label}
              </Link>
            ))}
            {isSignedIn && (
              <Link
                href="/my-scenarios"
                onClick={() => handleNavClick("/my-scenarios")}
                className="rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
              >
                My scenarios
              </Link>
            )}
            <Link
              href="/calculator"
              onClick={() => handleNavClick("/calculator")}
              className="btn-dark mt-2"
            >
              Run your scenario
            </Link>
          </nav>
        )}
      </header>
      {/* Scrim — covers page content behind the mobile menu, closes on tap */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[39] bg-ink/20 backdrop-blur-[2px] sm:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
