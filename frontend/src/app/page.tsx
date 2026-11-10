import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { Reveal } from "@/components/common/Reveal";
import { HeroWindowTimeline } from "@/components/landing/HeroWindowTimeline";

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
