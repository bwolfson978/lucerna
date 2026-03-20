"use client";

import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border h-14 flex items-center px-section md:px-page">
      <div className="w-full max-w-content mx-auto flex items-center justify-between">
        <Link href="/" className="text-[18px] font-bold text-text-primary tracking-tight">
          Lucerna
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/demo"
            className="text-body text-text-secondary hover:text-text-primary transition-colors duration-150"
          >
            See demo
          </Link>
          <Link
            href="/calculator"
            className="glow-button inline-flex items-center justify-center h-9 min-h-[44px] px-5 rounded-md text-white text-body font-medium active:scale-[0.98] transition-all duration-150"
          >
            Run your scenario
          </Link>
        </nav>
      </div>
    </header>
  );
}
