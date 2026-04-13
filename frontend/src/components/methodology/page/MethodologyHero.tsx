"use client";

export function MethodologyHero() {
  return (
    <div className="relative">
      {/* Gradient orbs — no overflow-hidden so they bleed naturally into the page */}
      <div className="gradient-orb gradient-orb-purple absolute -right-[100px] -top-[100px] opacity-60" />
      <div className="gradient-orb gradient-orb-gold absolute -bottom-[100px] -left-[100px] opacity-60" />

      <div className="relative z-10 flex max-w-2xl flex-col gap-comfortable">
        <h1 className="font-serif text-display text-text-primary md:text-display-xl">
          How Lucerna Works
        </h1>
        <p className="text-body text-text-secondary" style={{ lineHeight: 1.8 }}>
          A transparent look at the math behind your Roth conversion analysis. Every number Lucerna
          produces comes from a deterministic optimization engine. No black boxes, no hand-waving.
          Here is exactly how it works.
        </p>
      </div>
    </div>
  );
}
