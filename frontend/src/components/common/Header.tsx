"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSignOut, useUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { HowItWorksButton } from "@/components/methodology/HowItWorksButton";
import { SparkleIcon } from "@/components/common/icons";
import { Wordmark } from "@/components/common/Wordmark";

/** First in the nav so people find they can use the tool from their own AI assistant. */
const ASSISTANT_LINK = { href: "/connect", label: "Claude & ChatGPT" } as const;

const NAV_LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

interface HeaderProps {
  /** Overrides the signed-in state (Storybook, tests); the app leaves it to Clerk. */
  isSignedIn?: boolean;
}

export function Header({ isSignedIn: signedInOverride }: HeaderProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const user = useUser();
  const isSignedIn = signedInOverride ?? user.isSignedIn;
  const signOut = useSignOut();

  // Only close the menu explicitly when tapping the current page's link —
  // cross-page navigation unmounts this component, so the menu resets naturally.
  // Closing on cross-page clicks causes a flash: the scrim disappears before
  // the new page loads, briefly exposing the current page without the overlay.
  const handleNavClick = (href: string) => {
    if (pathname === href) setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-paper/80 px-default backdrop-blur-[14px] sm:px-7">
        <div className="mx-auto flex h-[68px] w-full max-w-wide items-center justify-between gap-4">
          <Wordmark />

          {/* Desktop nav: from lg, where the wordmark and every link fit on one line */}
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main">
            <Link
              href={ASSISTANT_LINK.href}
              aria-current={pathname === ASSISTANT_LINK.href ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 text-[15px] font-medium transition-colors duration-200 hover:text-text-primary",
                pathname === ASSISTANT_LINK.href ? "text-pine" : "text-text-secondary"
              )}
            >
              <SparkleIcon size={12} className="text-pine-mid" />
              {ASSISTANT_LINK.label}
            </Link>
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
            {isSignedIn && (
              <button
                type="button"
                onClick={signOut}
                className="text-[15px] font-medium text-text-secondary transition-colors duration-200 hover:text-text-primary"
              >
                Sign out
              </button>
            )}
            <HowItWorksButton />
            {/* Not on the calculator itself, where it would link to the page you're on. */}
            {pathname !== "/calculator" && (
              <Link href="/calculator" className="btn-dark min-h-[40px] px-6 py-2.5 text-[14.5px]">
                Run your scenario
              </Link>
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 lg:hidden">
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
            className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-border bg-paper px-default py-3 shadow-elevated lg:hidden"
            aria-label="Mobile"
          >
            <Link
              href={ASSISTANT_LINK.href}
              onClick={() => handleNavClick(ASSISTANT_LINK.href)}
              className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
            >
              <SparkleIcon size={13} className="text-pine-mid" />
              {ASSISTANT_LINK.label}
            </Link>
            {[{ href: "/", label: "Home" }, ...NAV_LINKS].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => handleNavClick(link.href)}
                className="-mx-2 rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
              >
                {link.label}
              </Link>
            ))}
            {isSignedIn && (
              <Link
                href="/my-scenarios"
                onClick={() => handleNavClick("/my-scenarios")}
                className="-mx-2 rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
              >
                My scenarios
              </Link>
            )}
            {isSignedIn && (
              <button
                type="button"
                onClick={signOut}
                className="-mx-2 rounded-lg px-2 py-2.5 text-left text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
              >
                Sign out
              </button>
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
          className="fixed inset-0 z-[39] bg-ink/20 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
