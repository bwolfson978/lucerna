import Link from "next/link";
import { Header } from "@/components/common/Header";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <Header />
      <main className="flex flex-col">
        {/* Hero */}
        <section className="relative overflow-hidden px-section py-page md:px-page">
          {/* Floating gradient orbs */}
          <div className="gradient-orb gradient-orb-purple absolute -right-[100px] -top-[100px]" />
          <div className="gradient-orb gradient-orb-gold absolute -bottom-[100px] -left-[100px]" />

          <div className="relative z-10 mx-auto flex max-w-content flex-col gap-section">
            <div className="flex max-w-2xl flex-col gap-comfortable">
              <h1 className="font-serif text-display text-text-primary md:text-display-xl">
                Compare multi-year Roth conversion scenarios to see what works for your situation
              </h1>
              <p className="max-w-lg text-body text-text-secondary" style={{ lineHeight: 1.8 }}>
                Map out Roth conversion scenarios across your lifetime and see how each one impacts
                your tax bill, and your long-term wealth.
              </p>
              <p className="max-w-lg text-body text-text-tertiary" style={{ lineHeight: 1.8 }}>
                Flexible enough for your specific situation. Simple enough that you don&apos;t need
                a spreadsheet or a financial expert to use it.
              </p>
              <div className="mt-section flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Link
                  href="/demo"
                  className="btn-gradient-primary inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[12px] px-5 py-3.5 text-[15px] font-semibold tracking-[0.3px] text-bg transition-all duration-300 hover:shadow-[0_8px_30px_rgba(240,198,116,0.25)] active:scale-[0.98] sm:px-8"
                >
                  See demo
                </Link>
                <Link
                  href="/calculator"
                  className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[12px] border border-[rgba(255,255,255,0.12)] bg-transparent px-5 py-3.5 text-[15px] font-semibold tracking-[0.3px] text-text-primary transition-all duration-300 hover:border-[rgba(255,255,255,0.25)] sm:px-8"
                >
                  Run your own scenario
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border bg-bg-alt px-section py-section-lg md:px-page">
          <div className="mx-auto max-w-content">
            <h2 className="mb-section font-serif text-h1 text-text-primary">How it works</h2>
            <div className="grid grid-cols-1 gap-section sm:grid-cols-3">
              <div className="flex flex-col gap-default">
                <span className="text-caption font-semibold text-accent">01</span>
                <h3 className="text-h3 text-text-primary">Describe your situation</h3>
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  Share a few details: your income, retirement savings, and how you see the next few
                  years unfolding. Career change, early retirement, sabbatical, whatever your path
                  looks like.
                </p>
              </div>
              <div className="flex flex-col gap-default">
                <span className="text-caption font-semibold text-accent">02</span>
                <h3 className="text-h3 text-text-primary">See what the numbers say</h3>
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  Our planner searches across conversion scenarios and surfaces the schedule that
                  keeps you in the lowest brackets, maximizing your after-tax wealth over time.
                </p>
              </div>
              <div className="flex flex-col gap-default">
                <span className="text-caption font-semibold text-accent">03</span>
                <h3 className="text-h3 text-text-primary">Explore the full picture</h3>
                <p className="text-body-sm leading-relaxed text-text-secondary">
                  See how conversions fill your brackets year by year, then adjust anything (income,
                  conversion amounts, assumptions) and watch the impact in real time. Understand the
                  tradeoffs and plan with confidence.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Demo teaser */}
        <section className="px-section py-section-lg md:px-page">
          <div className="mx-auto flex max-w-content flex-col gap-comfortable">
            <h2 className="font-serif text-h1 text-text-primary">See it in action</h2>
            <Card className="bg-bg-alt">
              <div className="flex flex-col gap-default">
                <span className="text-caption uppercase tracking-wider text-text-tertiary">
                  DEMO SCENARIO
                </span>
                <p className="text-body leading-relaxed text-text-primary">
                  <strong>Margaret, 63.</strong> Registered nurse who retired last year. $1.4M
                  traditional 401(k), no Social Security yet, and 10 years before required minimum
                  distributions force six-figure taxable income. The conversion window is open right
                  now.
                </p>
                <Link
                  href="/demo"
                  className="text-body font-medium text-accent transition-colors duration-300 hover:text-accent-hover"
                >
                  View full analysis →
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border px-section py-section md:px-page">
          <div className="mx-auto max-w-content text-body-sm text-text-tertiary">
            <p>
              This is an educational tool for scenario analysis. It does not provide financial, tax,
              or investment advice. Consult a qualified professional before making financial
              decisions.
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
