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
              Hi! I&apos;m Barry. My mini side quest into Roth conversions started while I was
              taking two years off work to do an MBA at MIT Sloan. A friend mentioned that a few
              low-income years can be a great window to convert, and I couldn&apos;t stop thinking
              about it.
            </p>
            <p>
              Little did I know that three classes would come together to give me just enough
              knowledge to be dangerous:
            </p>
            <ul className="flex flex-col gap-2 border-l-2 border-pine pl-5">
              {CLASSES.map(([course, lesson]) => (
                <li key={course}>
                  <strong className="font-semibold text-text-primary">{course}</strong>: {lesson}
                </li>
              ))}
            </ul>
            <p>
              When I started reading about Roth conversions in the Bogleheads community, I checked
              out every option I could find. There was expensive, complicated software built for
              financial advisors. There were overly simple calculators that only looked at one year
              at a time and couldn&apos;t tell me how much to convert in each year. And there were
              some hardcore spreadsheet DIYers. What I couldn&apos;t find was a general, reusable
              tool.
            </p>
            <p>
              So I took the spreadsheet route. After weeks of brutal modeling, I committed to
              packaging up what I learned into software that&apos;s easy to use, so fewer people
              have to go through that in the future.
            </p>
            <p>
              Whether you&apos;re taking a sabbatical, changing careers, starting a business, or in
              the early years of retirement before required minimum distributions begin, those
              in-between years can be an opportunity. This tool is meant to help you lay out your
              scenarios, see them, play with them, and feel more informed about whatever your
              financial future throws at you.
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
