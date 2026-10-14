import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import barryPhoto from "../../../public/barry.jpg";

export const metadata: Metadata = {
  title: "About | Roth Conversions Optimizer",
  description:
    "Why Barry Wolfson built Roth Conversions Optimizer: an MBA side quest, three classes and weeks of spreadsheet modeling, packaged into an easy-to-use tool.",
  openGraph: {
    title: "About | Roth Conversions Optimizer",
    description: "Why I built a multi-year Roth conversion optimizer.",
    type: "website",
  },
};

const CLASSES = [
  ["Tax", "after-tax wealth and tax brackets"],
  ["Finance", "the present value of future cash flows"],
  ["Data, Models, and Decisions", "modeling constrained optimization problems"],
] as const;

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <article className="mx-auto flex max-w-[680px] flex-col gap-8">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
            <Image
              src={barryPhoto}
              alt="Barry Wolfson on horseback"
              width={128}
              height={128}
              priority
              className="h-28 w-28 shrink-0 rounded-full border border-border object-cover sm:h-32 sm:w-32"
            />
            <div className="flex flex-col gap-2">
              <p className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
                About
              </p>
              <h1 className="display-heading text-display">Why I built this</h1>
            </div>
          </header>

          <div className="flex flex-col gap-5 text-body leading-relaxed text-text-secondary">
            <p>
              I&apos;m Barry. I first came across Roth conversions while taking two years off work
              for an MBA at MIT Sloan. A friend pointed out that a few low-income years can be a
              good window to convert, so I looked into it.
            </p>
            <p>
              What I found was expensive, complicated software built for financial advisors, simple
              calculators that only modeled one year at a time, and a few detailed spreadsheets
              built by DIYers in the Bogleheads community. None of them told me how much to convert
              in each year.
            </p>
            <p>But, little did I know, three of my classes had already covered the pieces:</p>
            <ul className="flex flex-col gap-2 border-l-2 border-pine pl-5">
              {CLASSES.map(([course, lesson]) => (
                <li key={course}>
                  <strong className="font-semibold text-text-primary">{course}</strong>: {lesson}
                </li>
              ))}
            </ul>
            <p>
              So initially I took the spreadsheet route. After weeks of modeling, I turned what I
              learned into this tool, so others don&apos;t have to build their own.
            </p>
            <p>
              Whether you&apos;re on a sabbatical, changing careers, starting a business, or in the
              early years of retirement before required minimum distributions begin, it&apos;s meant
              to help you lay out your scenarios, compare them, and see the tradeoffs more clearly.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/calculator" className="btn-dark min-h-[44px] px-6 py-3 text-[15px]">
              Run your scenario
            </Link>
            <Link href="/methodology" className="btn-ghost min-h-[44px] px-6 py-3 text-[15px]">
              How the math works
            </Link>
          </div>

          <p className="border-t border-border pt-6 text-body-sm leading-relaxed text-text-tertiary">
            Roth Conversions Optimizer is an educational tool for scenario analysis. It does not
            provide financial, tax, or investment advice. Tax laws change. Consult a qualified
            professional before making financial decisions.
          </p>
        </article>
      </main>
      <PageFooter />
    </>
  );
}
