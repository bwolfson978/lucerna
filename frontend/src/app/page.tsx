import Link from "next/link";
import { Header } from "@/components/common/Header";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden px-section md:px-page py-page">
          {/* Floating gradient orbs */}
          <div className="gradient-orb gradient-orb-purple absolute -top-[100px] -right-[100px]" />
          <div className="gradient-orb gradient-orb-gold absolute -bottom-[100px] -left-[100px]" />

          <div className="relative z-10 max-w-content mx-auto flex flex-col gap-section">
            <div className="flex flex-col gap-comfortable max-w-2xl">
              <h1 className="text-display md:text-display-xl text-text-primary font-serif">
                Compare multi-year Roth conversion scenarios to see what works for your situation
              </h1>
              <p className="text-body text-text-secondary max-w-lg" style={{ lineHeight: 1.8 }}>
                Map out Roth conversion scenarios across your lifetime and see how each one hits your brackets, your tax bill, and your long-term wealth.
              </p>
              <p className="text-body text-text-tertiary max-w-lg" style={{ lineHeight: 1.8 }}>
                Flexible enough for your specific situation. Simple enough that you don&apos;t need a spreadsheet or a financial expert to use it.
              </p>
              <div className="flex items-center gap-4 mt-section">
                <Link
                  href="/demo"
                  className="btn-gradient-primary inline-flex items-center justify-center min-h-[44px] py-3.5 px-8 rounded-[12px] text-bg text-[15px] font-semibold tracking-[0.3px] hover:shadow-[0_8px_30px_rgba(240,198,116,0.25)] active:scale-[0.98] transition-all duration-300"
                >
                  See demo
                </Link>
                <Link
                  href="/calculator"
                  className="inline-flex items-center justify-center min-h-[44px] py-3.5 px-8 rounded-[12px] bg-transparent border border-[rgba(255,255,255,0.12)] text-text-primary text-[15px] font-semibold tracking-[0.3px] hover:border-[rgba(255,255,255,0.25)] transition-all duration-300"
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
            <h2 className="text-h1 text-text-primary mb-section font-serif">
              How it works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-section">
              <div className="flex flex-col gap-default">
                <span className="text-caption text-accent font-semibold">01</span>
                <h3 className="text-h3 text-text-primary">
                  Describe your situation
                </h3>
                <p className="text-body-sm text-text-secondary leading-relaxed">
                  Share a few details — your income, retirement savings, and
                  how you see the next few years unfolding. Career change,
                  early retirement, sabbatical — whatever your path looks like.
                </p>
              </div>
              <div className="flex flex-col gap-default">
                <span className="text-caption text-accent font-semibold">02</span>
                <h3 className="text-h3 text-text-primary">
                  See what the numbers say
                </h3>
                <p className="text-body-sm text-text-secondary leading-relaxed">
                  Our planner searches across conversion scenarios and surfaces
                  the schedule that keeps you in the lowest brackets —
                  maximizing your after-tax wealth over time.
                </p>
              </div>
              <div className="flex flex-col gap-default">
                <span className="text-caption text-accent font-semibold">03</span>
                <h3 className="text-h3 text-text-primary">
                  Explore the full picture
                </h3>
                <p className="text-body-sm text-text-secondary leading-relaxed">
                  See how conversions fill your brackets year by year, then
                  adjust anything — income, conversion amounts, assumptions —
                  and watch the impact in real time. Understand the tradeoffs
                  and plan with confidence.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Demo teaser */}
        <section className="px-section md:px-page py-section-lg">
          <div className="max-w-content mx-auto flex flex-col gap-comfortable">
            <h2 className="text-h1 text-text-primary font-serif">
              See it in action
            </h2>
            <Card className="bg-bg-alt">
              <div className="flex flex-col gap-default">
                <span className="text-caption text-text-tertiary uppercase tracking-wider">
                  DEMO SCENARIO
                </span>
                <p className="text-body text-text-primary leading-relaxed">
                  <strong>Alex, 38</strong> — Senior SWE who left to co-found a
                  startup. $210K traditional IRA/401(k), 3-year income trajectory:
                  $35K → $30K → $150K. Two low-income years create a window
                  to convert at lower brackets.
                </p>
                <Link
                  href="/demo"
                  className="text-body text-accent hover:text-accent-hover font-medium transition-colors duration-300"
                >
                  View full analysis →
                </Link>
              </div>
            </Card>
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
