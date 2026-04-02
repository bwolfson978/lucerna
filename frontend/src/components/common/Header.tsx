"use client";

import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border h-14 flex items-center px-section md:px-page">
      <div className="w-full max-w-content mx-auto flex items-center justify-between">
        <Link href="/" className="font-serif text-[18px] font-bold text-text-primary tracking-tight">
          Lucerna
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/demo"
            className="text-body text-text-secondary hover:text-accent transition-colors duration-300"
          >
            See demo
          </Link>
          <Link
            href="/calculator"
            className="glow-button inline-flex items-center justify-center h-12 min-h-[44px] px-8 rounded-xl text-bg text-[15px] font-semibold tracking-[0.3px] active:scale-[0.98] transition-all duration-300"
          >
            Run your scenario
          </Link>
        </nav>
      </div>
    </header>
  );
}
