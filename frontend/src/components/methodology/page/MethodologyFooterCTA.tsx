"use client";

import Link from "next/link";

export function MethodologyFooterCTA() {
  return (
    <div className="relative">
      <div className="gradient-orb gradient-orb-gold absolute -right-[80px] -top-[80px] opacity-60" />

      <div className="relative z-10 flex max-w-xl flex-col gap-comfortable">
        <h2 className="font-serif text-h1 text-text-primary">See what the numbers say</h2>
        <p className="text-body text-text-secondary" style={{ lineHeight: 1.8 }}>
          Try the demo scenario or run your own. Every result links back to the methodology
          explained on this page.
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/demo"
            className="btn-gradient-primary inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[12px] px-5 py-3.5 text-[15px] font-semibold tracking-[0.3px] text-bg transition-all duration-300 hover:shadow-[0_8px_30px_rgba(240,198,116,0.25)] active:scale-[0.98] sm:px-8"
          >
            See demo
          </Link>
          <Link
            href="/calculator"
            className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-transparent px-5 py-3.5 text-[15px] font-semibold tracking-[0.3px] text-text-primary transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] sm:px-8"
          >
            Run your own scenario
          </Link>
        </div>
      </div>
    </div>
  );
}
