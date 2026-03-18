import Link from "next/link";
import { Header } from "@/components/common/Header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        {/* Hero */}
        <section className="px-section md:px-page py-page">
          <div className="max-w-content mx-auto flex flex-col gap-section">
            <div className="flex flex-col gap-comfortable max-w-2xl">
              <h1 className="text-display md:text-[42px] md:leading-[1.1] text-text-primary tracking-tight">
                Find the optimal Roth conversion schedule across your income trajectory
              </h1>
              <p className="text-body text-text-secondary max-w-lg">
                Most tools tell you <em>whether</em> to convert. Lucerna tells you{" "}
                <strong>how much to convert each year</strong> — finding the conversion
                schedule that maximizes your after-tax wealth across multiple years.
              </p>
              <div className="flex items-center gap-3 mt-comfortable">
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center h-9 min-h-[44px] px-4 rounded bg-accent text-white text-body font-medium hover:bg-accent-hover active:scale-[0.98] transition-all duration-100"
                >
                  See demo
                </Link>
                <Link
                  href="/calculator"
                  className="inline-flex items-center justify-center h-9 min-h-[44px] px-4 rounded bg-transparent border border-border-emphasis text-text-primary text-body font-medium hover:bg-bg-hover transition-all duration-100"
                >
                  Run your scenario
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-section md:px-page py-section-lg bg-bg-alt border-y border-border">
          <div className="max-w-content mx-auto">
            <h2 className="text-h2 text-text-primary mb-section">
              How it works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-section">
              <div className="flex flex-col gap-tight">
                <span className="text-caption text-accent font-medium">01</span>
                <h3 className="text-h3 text-text-primary">
                  Enter your income trajectory
                </h3>
                <p className="text-body-sm text-text-secondary">
                  Tell us your expected income for the next few years —
                  including career changes, sabbaticals, or early retirement.
                </p>
              </div>
              <div className="flex flex-col gap-tight">
                <span className="text-caption text-accent font-medium">02</span>
                <h3 className="text-h3 text-text-primary">
                  Optimizer finds conversions
                </h3>
                <p className="text-body-sm text-text-secondary">
                  Our multi-year optimizer places conversions in your lowest-tax
                  years, filling cheap brackets before expensive ones.
                </p>
              </div>
              <div className="flex flex-col gap-tight">
                <span className="text-caption text-accent font-medium">03</span>
                <h3 className="text-h3 text-text-primary">
                  See the full picture
                </h3>
                <p className="text-body-sm text-text-secondary">
                  Visualize your bracket fill year-by-year, compare scenarios,
                  and understand exactly how much you could save.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Demo teaser */}
        <section className="px-section md:px-page py-section-lg">
          <div className="max-w-content mx-auto flex flex-col gap-comfortable">
            <h2 className="text-h2 text-text-primary">
              See it in action
            </h2>
            <div className="card bg-bg-alt">
              <div className="flex flex-col gap-tight">
                <span className="text-caption text-text-tertiary">
                  DEMO SCENARIO
                </span>
                <p className="text-body text-text-primary">
                  <strong>Alex, 38</strong> — Senior SWE who left to co-found a
                  startup. $210K traditional IRA, 3-year income trajectory:
                  $35K → $30K → $150K. Two low-income years create a window
                  to convert at lower brackets.
                </p>
                <Link
                  href="/demo"
                  className="text-body text-accent hover:underline font-medium mt-tight"
                >
                  View full analysis →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-section md:px-page py-section border-t border-border">
          <div className="max-w-content mx-auto text-body-sm text-text-tertiary">
            <p>
              Lucerna is an educational tool for scenario analysis. It does not
              provide financial, tax, or investment advice. Consult a qualified
              professional before making financial decisions.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
