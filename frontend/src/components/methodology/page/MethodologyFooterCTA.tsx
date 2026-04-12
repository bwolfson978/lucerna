"use client";

import Link from "next/link";

export function MethodologyFooterCTA() {
  return (
    <div className="relative overflow-hidden">
      <div className="gradient-orb gradient-orb-gold absolute -top-[80px] -right-[80px]" />

      <div className="relative z-10 flex flex-col gap-comfortable max-w-xl">
        <h2 className="text-h1 text-text-primary font-serif">
          See what the numbers say
        </h2>
        <p className="text-body text-text-secondary" style={{ lineHeight: 1.8 }}>
          Try the demo scenario or run your own. Every result links back to the
          methodology explained on this page.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          <Link
            href="/demo"
            className="btn-gradient-primary inline-flex items-center justify-center min-h-[44px] py-3.5 px-5 sm:px-8 rounded-[12px] text-bg text-[15px] font-semibold tracking-[0.3px] whitespace-nowrap hover:shadow-[0_8px_30px_rgba(240,198,116,0.25)] active:scale-[0.98] transition-all duration-300"
          >
            See demo
          </Link>
          <Link
            href="/calculator"
            className="inline-flex items-center justify-center min-h-[44px] py-3.5 px-5 sm:px-8 rounded-[12px] bg-transparent border border-[rgba(255,255,255,0.12)] text-text-primary text-[15px] font-semibold tracking-[0.3px] whitespace-nowrap hover:border-[rgba(255,255,255,0.25)] transition-all duration-300"
          >
            Run your own scenario
          </Link>
        </div>
      </div>
    </div>
  );
}
