"use client";

import Link from "next/link";

export function MethodologyFooterCTA() {
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-pine-deep px-6 py-12 text-[#efece2] sm:px-12 sm:py-16">
      <div className="dark-wash" />

      <div className="relative z-10 flex max-w-xl flex-col gap-comfortable">
        <h2 className="display-heading text-display !text-white [&_em]:!text-sage">
          See what the <em>numbers say.</em>
        </h2>
        <p className="text-body text-pine-haze" style={{ lineHeight: 1.8 }}>
          Try the demo scenario or run your own. Every result links back to the methodology
          explained on this page.
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Link href="/demo" className="btn-paper">
            See an example
          </Link>
          <Link href="/calculator" className="btn-outline-paper">
            Discuss your numbers
          </Link>
        </div>
      </div>
    </div>
  );
}
