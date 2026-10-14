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
              {
                "Hi there 👋 I'm Barry. Although I've always been interested in investing and personal finance, this side quest to optimize roth conversion schedules started while at MIT, where I took two years off from work to attend graduate school. A friend had mentioned two lower-income years could be a good opportunity for roth conversions, so I decided to look into it."
              }
            </p>
            <p>
              {
                'Starting with what I assumed would be a straightforward question to answer, "how much should I convert, and over the course of which years?", I went searching for answers. Unfortunately, all I found was expensive, complicated financial tax software at one end of the spectrum and overly simplistic calculators on the other.'
              }
            </p>
            <p>
              {
                "So, armed with the wide-eyed optimism of grad school and the knowledge from three of the more intimidating classes at Sloan - Tax Strategy, Managerial Finance, and Data, Models, and Decisions, I set out to weave knowledge of tax brackets, retirement accounts, present value of future cash flows, and constraint optimization problems into a usable product."
              }
            </p>
            <p>
              {
                "Although the v1 excel spreadsheet (built sans AI mind you!) took an embarassingly large amount of hours to complete, it drove a major financial decision for both my wife and I (albeit, after a couple rounds of sanity checking with financial professionals). After that experience, I wanted to package up the learnings into a simple, easy-to-use experience for others attempting to answer similar questions in the future, which is what led to this site."
              }
            </p>
            <p>
              {
                'So, whether you\'re on a sabbatical, transitioning careers, taking time off to start a business, in the early years of retirement pre-RMDs, or in any other form of "in-between" period which puts you in lower tax brackets, the tool is meant to help explore possible scenarios, interact with them, and understand the tradeoffs more clearly, without being overwhelming or expensive.'
              }
            </p>
            <p>
              {
                "I hope you find it valuable, and I'd love to hear any feature requests and/or feedback you might have - I read every message sent through the "
              }
              <Link href="/support" className="text-pine underline underline-offset-2">
                Support
              </Link>
              {" and "}
              <Link href="/feedback" className="text-pine underline underline-offset-2">
                Feedback
              </Link>
              {" channels."}
            </p>
            <p>
              Cheers!
              <br />
              Barry
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
