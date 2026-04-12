"use client";

export function MethodologyHero() {
  return (
    <div className="relative overflow-hidden">
      {/* Gradient orbs */}
      <div className="gradient-orb gradient-orb-purple absolute -top-[100px] -right-[100px]" />
      <div className="gradient-orb gradient-orb-gold absolute -bottom-[100px] -left-[100px]" />

      <div className="relative z-10 flex flex-col gap-comfortable max-w-2xl">
        <h1 className="text-display md:text-display-xl text-text-primary font-serif">
          How Lucerna Works
        </h1>
        <p className="text-body text-text-secondary" style={{ lineHeight: 1.8 }}>
          A transparent look at the math behind your Roth conversion analysis.
          Every number Lucerna produces comes from a deterministic optimization
          engine. No black boxes, no hand-waving. Here is exactly how it works.
        </p>
      </div>
    </div>
  );
}
