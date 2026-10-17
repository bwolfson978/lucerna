"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AUTH_ENABLED,
  SignInButton,
  SignUpButton,
  useAccountProfile,
  useSignOut,
  useUser,
} from "@/lib/auth";
import { cn } from "@/lib/utils";
import { HowItWorksButton } from "@/components/methodology/HowItWorksButton";
import { SparkleIcon } from "@/components/common/icons";
import { Wordmark } from "@/components/common/Wordmark";
import { AccountMenu, type AccountIdentity } from "@/components/common/AccountMenu";

/** First in the nav so people find they can use the tool from their own AI assistant. */
const ASSISTANT_LINK = { href: "/connect", label: "Claude & ChatGPT" } as const;

const NAV_LINKS = [
  { href: "/demo", label: "Demo" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" },
] as const;

interface HeaderProps {
  /**
   * Overrides the signed-in state (Storybook, tests); the app leaves it to Clerk. Set, it
   * also shows the sign-in buttons without Clerk, inert.
   */
  isSignedIn?: boolean;
  /** Overrides who is signed in, for the account menu (Storybook, tests). */
  account?: AccountIdentity;
  /** Opens the account menu on first render (Storybook, screenshots). */
  accountMenuOpen?: boolean;
}

export function Header({
  isSignedIn: signedInOverride,
  account: accountOverride,
  accountMenuOpen,
}: HeaderProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const user = useUser();
  const isSignedIn = signedInOverride ?? user.isSignedIn;
  const signOut = useSignOut();
  const profile = useAccountProfile();
  const account = accountOverride ?? profile ?? { name: "", email: "" };
  const previewAuth = signedInOverride !== undefined;

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

          {/* Desktop nav: only from the width where the wordmark and every item fit on one
              line. Labels never wrap; the "How does it work?" pill drops to its icon when
              space is tight. */}
          <nav className="hidden items-center gap-3.5 lg:flex xl:gap-7" aria-label="Main">
            <Link
              href={ASSISTANT_LINK.href}
              aria-current={pathname === ASSISTANT_LINK.href ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[15px] font-medium transition-colors duration-200 hover:text-text-primary",
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
                  "shrink-0 whitespace-nowrap text-[15px] font-medium transition-colors duration-200 hover:text-text-primary",
                  pathname === link.href ? "text-pine" : "text-text-secondary"
                )}
              >
                {link.label}
              </Link>
            ))}
            <HowItWorksButton label="never" />
            {/* Signed out: sign in sits before the main action. Its window links to creating
                an account, so the header carries one dark button. */}
            {!isSignedIn && (
              <SignInButton preview={previewAuth}>
                <button
                  type="button"
                  className="shrink-0 whitespace-nowrap text-[15px] font-medium text-text-primary transition-colors duration-200 hover:text-pine"
                >
                  Sign in
                </button>
              </SignInButton>
            )}
            {/* Not on the calculator itself, where it would link to the page you're on. */}
            {pathname !== "/calculator" && (
              <Link
                href="/calculator"
                className="btn-dark min-h-[40px] shrink-0 whitespace-nowrap px-5 py-2.5 text-[14.5px] xl:px-6"
              >
                Run your scenario
              </Link>
            )}
            {isSignedIn && (
              <AccountMenu account={account} onSignOut={signOut} defaultOpen={accountMenuOpen} />
            )}
          </nav>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 lg:hidden">
            <HowItWorksButton />
            {isSignedIn && <AccountMenu account={account} onSignOut={signOut} />}
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
            <Link
              href="/calculator"
              onClick={() => handleNavClick("/calculator")}
              className="btn-dark mt-2"
            >
              Run your scenario
            </Link>
            {isSignedIn ? (
              <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
                <div className="flex min-w-0 items-center gap-3 py-2">
                  <span
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-pine-mid text-[13px] font-semibold text-[#f5f2ea]"
                    aria-hidden="true"
                  >
                    {(account.name || account.email).trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body-sm font-semibold text-text-primary">
                      {account.name || account.email}
                    </span>
                    {account.name && (
                      <span className="truncate text-caption font-normal text-text-tertiary">
                        {account.email}
                      </span>
                    )}
                  </span>
                </div>
                <Link
                  href="/my-scenarios"
                  onClick={() => handleNavClick("/my-scenarios")}
                  className="-mx-2 rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
                >
                  My scenarios
                </Link>
                <Link
                  href="/account"
                  onClick={() => handleNavClick("/account")}
                  className="-mx-2 rounded-lg px-2 py-2.5 text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
                >
                  Account settings
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="-mx-2 rounded-lg px-2 py-2.5 text-left text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine"
                >
                  Sign out
                </button>
              </div>
            ) : (
              (AUTH_ENABLED || previewAuth) && (
                <div className="mt-3 flex flex-col gap-2.5 border-t border-border pt-4">
                  <p className="text-body-sm text-text-tertiary">
                    Save scenarios and pick up where you left off.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <SignInButton preview={previewAuth}>
                      <button type="button" className="btn-ghost">
                        Sign in
                      </button>
                    </SignInButton>
                    <SignUpButton preview={previewAuth}>
                      <button type="button" className="btn-ghost">
                        Create account
                      </button>
                    </SignUpButton>
                  </div>
                </div>
              )
            )}
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
