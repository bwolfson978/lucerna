import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { Reveal } from "@/components/common/Reveal";
import { HeroWindowTimeline } from "@/components/landing/HeroWindowTimeline";
import { IncomeWindowMap } from "@/components/landing/IncomeWindowMap";
import { BracketFiller } from "@/components/landing/BracketFiller";
import { LandingDemo } from "@/components/landing/LandingDemo";
import { WhyItMatters } from "@/components/landing/WhyItMatters";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden px-default pb-12 pt-8 sm:px-7 sm:pb-16 sm:pt-14 lg:pb-[90px] lg:pt-20">
          <div className="hero-wash" />
          <div className="relative mx-auto max-w-wide">
            <div className="mx-auto max-w-[980px] text-center">
              <Reveal className="eyebrow-pine mb-3 sm:mb-5">For the in-between years</Reveal>
              <Reveal
                as="h1"
                delay={1}
                className="display-heading mb-3 text-[2.1rem] leading-[1.08] sm:mb-5 sm:text-display-xl"
              >
                Your <span className="whitespace-nowrap">in-between</span> years
                <br />
                <em>are a tax opportunity.</em>
              </Reveal>
              <Reveal
                as="p"
                delay={2}
                className="mx-auto max-w-[640px] text-[1rem] leading-[1.55] text-text-secondary sm:text-[1.2rem] sm:leading-[1.65]"
              >
                Most lives have a few years when income dips. Converting to Roth in those years can
                mean less tax over a lifetime.{" "}
                <span className="hidden sm:inline">
                  Pick a situation to see where the window falls.
                </span>
              </Reveal>
            </div>
            <Reveal delay={3} className="mt-6 sm:mt-10">
              <HeroWindowTimeline />
            </Reveal>
          </div>
        </section>

        {/* 01: Find the window */}
        <section id="how" className="px-default py-[72px] sm:px-7 lg:py-[110px]">
          <div className="mx-auto grid max-w-wide grid-cols-1 items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <div>
              <StepNumber>01</StepNumber>
              <Reveal as="h2" delay={1} className="display-heading mb-5 text-display">
                Find the window
                <br />
                <em>before it closes.</em>
              </Reveal>
              <Reveal
                delay={2}
                className="flex max-w-[460px] flex-col gap-4 text-[1.06rem] text-text-secondary"
              >
                <p>
                  Share a few details: income, savings, and how the next decades look. The optimizer
                  charts every income source across your lifetime, from salary to Social Security to
                  pensions.
                </p>
                <p>
                  Then it shows you the gap: the low-income years{" "}
                  <strong className="text-text-primary">
                    between retirement and required minimum distributions
                  </strong>
                  , when your tax rate is at its lowest and each conversion dollar goes furthest.
                </p>
                <p className="text-[0.95rem] text-text-tertiary">
                  Move the sliders to see how retirement timing changes the window. Miss it, and
                  RMDs fill those brackets for you.
                </p>
              </Reveal>
            </div>
            <Reveal delay={2}>
              <IncomeWindowMap />
            </Reveal>
          </div>
        </section>

        {/* 02: Fill your brackets */}
        <section
          id="brackets"
          className="border-y border-border bg-paper-warm px-default py-[72px] sm:px-7 lg:py-[110px]"
        >
          <div className="mx-auto grid max-w-wide grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <div className="lg:order-2">
              <StepNumber>02</StepNumber>
              <Reveal as="h2" delay={1} className="display-heading mb-5 text-display">
                Fill your brackets,
                <br />
                <em>not the IRS&rsquo;s.</em>
              </Reveal>
              <Reveal
                delay={2}
                className="flex max-w-[460px] flex-col gap-4 text-[1.06rem] text-text-secondary"
              >
                <p>
                  The optimizer weighs every year of your timeline together and surfaces the
                  schedule that keeps conversions in the lowest brackets available, year after year,
                  to maximize after-tax wealth over your lifetime.
                </p>
                <p>
                  No spreadsheets. No guessing at &ldquo;how much should I convert?&rdquo; The
                  answer is a number, for <strong className="text-text-primary">every year</strong>.
                </p>
              </Reveal>
            </div>
            <Reveal delay={2} className="lg:order-1">
              <BracketFiller />
            </Reveal>
          </div>
        </section>

        {/* 03 + Margaret: live engine output */}
        <LandingDemo />

        {/* Why it matters */}
        <WhyItMatters />

        {/* Final CTA */}
        <section id="start" className="px-default sm:px-7">
          <Reveal className="relative mx-auto max-w-wide overflow-hidden rounded-[26px] bg-pine-deep px-6 py-16 text-center text-[#efece2] sm:px-[60px] sm:py-[90px]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(700px 340px at 50% -10%, rgba(102,161,131,0.2), transparent 60%)",
              }}
            />
            <div className="relative mb-5 font-ui text-[12px] font-bold uppercase tracking-[0.22em] text-sage">
              Get started
            </div>
            <h2 className="display-heading relative text-display !text-white [&_em]:!text-sage">
              Start with <em>your window.</em>
            </h2>
            <p className="relative mx-auto mt-5 max-w-[520px] text-pine-haze">
              Answer a few questions, see where your low-tax years fall, and plan from there.
              Flexible enough for your situation, simple enough that you won&rsquo;t need a
              spreadsheet.
            </p>
            <div className="relative mt-9 flex flex-col justify-center gap-3.5 sm:flex-row">
              <Link href="/calculator" className="btn-paper">
                Discuss your numbers
              </Link>
              <Link href="/demo" className="btn-outline-paper">
                See an example
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
      <PageFooter />
    </>
  );
}

function StepNumber({ children }: { children: string }) {
  return (
    <Reveal as="span" className="mb-3.5 block font-mono text-[13px] tracking-[0.1em] text-sage">
      {children}
    </Reveal>
  );
}
