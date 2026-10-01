"use client";

export function MethodologyHero() {
  return (
    <div className="relative">
      <div className="hero-wash -inset-x-[200px] -top-[120px]" />

      <div className="relative z-10 flex max-w-2xl flex-col gap-comfortable">
        <span className="eyebrow-pine">Methodology</span>
        <h1 className="display-heading text-display-xl">
          How it <em>works.</em>
        </h1>
        <p
          className="text-[1.08rem] text-text-secondary sm:text-[1.2rem]"
          style={{ lineHeight: 1.7 }}
        >
          A transparent look at the math behind your Roth conversion analysis. Every number produced
          comes from a deterministic optimization engine. No black boxes, no hand-waving. Here is
          exactly how it works.
        </p>
      </div>
    </div>
  );
}
