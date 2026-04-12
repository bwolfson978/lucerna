"use client";

import { useMemo } from "react";
import { Header } from "@/components/common/Header";
import { MethodologyHero } from "@/components/methodology/page/MethodologyHero";
import { MethodologySection } from "@/components/methodology/page/MethodologySection";
import { MethodologyFooterCTA } from "@/components/methodology/page/MethodologyFooterCTA";
import { TableOfContents, type TocItem } from "@/components/methodology/page/TableOfContents";
import { useScrollSpy } from "@/hooks/useScrollSpy";
import {
  RothFlowDiagram,
  BracketFillExplainer,
  TradeoffScale,
  MultiYearAllocation,
  NpvTimeline,
  OptimizationPipeline,
  AcaSubsidyCurve,
  RmdComparison,
} from "@/components/methodology/diagrams";

const TOC_ITEMS: TocItem[] = [
  { id: "roth-basics", number: "01", title: "What is a Roth Conversion?" },
  { id: "bracket-filling", number: "02", title: "Tax Bracket Filling" },
  { id: "core-tradeoff", number: "03", title: "The Core Trade-off" },
  { id: "multi-year", number: "04", title: "Multi-Year Allocation" },
  { id: "npv-model", number: "05", title: "The Lifetime Model" },
  { id: "optimization", number: "06", title: "Optimization Approach" },
  { id: "aca-subsidies", number: "07", title: "ACA Subsidy Awareness" },
  { id: "rmd-impact", number: "08", title: "RMD Impact" },
  { id: "assumptions", number: "09", title: "Assumptions & Limitations" },
];

const SECTION_IDS = TOC_ITEMS.map((item) => item.id);

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-body text-text-secondary" style={{ lineHeight: 1.8 }}>
      {children}
    </p>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-h3 text-accent font-ui uppercase tracking-wider text-[13px]">
      {children}
    </h3>
  );
}

export function MethodologyPageClient() {
  const activeId = useScrollSpy(SECTION_IDS);

  const assumptionsData = useMemo(
    () => [
      { assumption: "Annual growth rate", value: "7%", rationale: "Historical average real return of a diversified stock portfolio" },
      { assumption: "Discount rate", value: "5%", rationale: "Moderate rate that avoids overstating future benefits" },
      { assumption: "Tax brackets", value: "2026", rationale: "IRS Revenue Procedure 2025-32 (most current available)" },
      { assumption: "Deduction", value: "Standard", rationale: "Itemized deductions are not modeled" },
      { assumption: "Retirement spending", value: "4% rule", rationale: "4% of total balance at retirement, unless specified" },
      { assumption: "State taxes", value: "Optional", rationale: "Included when a state is selected, otherwise federal only" },
    ],
    []
  );

  return (
    <>
      <Header />
      <div className="flex">
        {/* Desktop TOC sidebar */}
        <div className="hidden lg:block shrink-0 pl-page pt-section-lg">
          <TableOfContents items={TOC_ITEMS} activeId={activeId} />
        </div>

        <main className="flex-1 min-w-0">
          {/* Mobile TOC (hidden on desktop where the sidebar shows instead) */}
          <div className="lg:hidden">
            <TableOfContents items={TOC_ITEMS} activeId={activeId} />
          </div>

          <div className="px-default md:px-page">
            <div className="max-w-content mx-auto flex flex-col gap-section-lg py-section-lg">
              {/* Hero */}
              <MethodologyHero />

              {/* Section 1: What is a Roth Conversion? */}
              <MethodologySection id="roth-basics" number="01" title="What is a Roth Conversion?">
                <P>
                  A Roth conversion moves money from a Traditional IRA (or rolled-over 401k) into a Roth IRA.
                  Traditional accounts grow tax-deferred: contributions may be deductible, but every dollar
                  withdrawn in retirement is taxed as ordinary income. Roth accounts work the opposite way:
                  contributions are made with after-tax dollars, but all future growth and withdrawals are
                  completely tax-free.
                </P>
                <P>
                  The conversion itself triggers a tax bill. The amount converted is added to your taxable income
                  for the year, just like earning extra wages. The question is whether paying that tax now, at
                  your current rate, saves money compared to paying tax later when you withdraw in retirement.
                </P>
                <RothFlowDiagram />
                <P>
                  When your current tax rate is lower than the rate you expect to face in retirement, converting
                  creates a net benefit. The challenge is figuring out exactly how much to convert, and when,
                  to maximize that benefit without pushing into expensive tax brackets.
                </P>
              </MethodologySection>

              {/* Section 2: Tax Bracket Filling */}
              <MethodologySection id="bracket-filling" number="02" title="Tax Bracket Filling">
                <P>
                  Federal income tax uses progressive brackets. Your income fills them from the bottom up:
                  the first dollars are taxed at 10%, then 12%, then 22%, and so on. Each bracket has a
                  ceiling. Once one fills up, the next dollar spills into the next bracket at a higher rate.
                </P>
                <P>
                  Roth conversions add to your taxable income for the year. They fill whatever bracket space
                  remains above your earned income. If your salary fills through the 12% bracket, a conversion
                  starts filling the 22% bracket. The key insight: lower-income years leave more room in
                  cheaper brackets. That room is the conversion opportunity.
                </P>
                <BracketFillExplainer />
                <SubHeading>Where the engine stops converting</SubHeading>
                <P>
                  The engine stops when the cost of entering the next bracket exceeds the long-term benefit.
                  Converting into a bracket cheaper than your expected retirement rate saves money. Going
                  higher costs more than it saves. The bracket visualization in your results shows exactly
                  where this boundary falls for each year.
                </P>
              </MethodologySection>

              {/* Section 3: The Core Trade-off */}
              <MethodologySection id="core-tradeoff" number="03" title="The Core Trade-off">
                <P>
                  Every Roth conversion is a bet: pay tax now at your current marginal rate, or pay tax
                  later at whatever rate applies when you withdraw in retirement. The analysis finds the
                  amount where the marginal cost of converting one more dollar roughly equals the marginal
                  benefit of avoiding future tax on that dollar.
                </P>
                <TradeoffScale />
                <SubHeading>Why not convert everything?</SubHeading>
                <P>
                  Converting your entire Traditional IRA in a single year pushes you deep into higher
                  tax brackets. The tax cost spikes far beyond what you would pay withdrawing gradually
                  in retirement. That excess tax is never recovered, even with decades of tax-free Roth growth.
                </P>
                <SubHeading>Why not convert nothing?</SubHeading>
                <P>
                  Leaving everything in Traditional means every dollar is taxed when withdrawn in retirement.
                  If your retirement withdrawals (including Required Minimum Distributions) land you in
                  similar or higher brackets than your current low-income years, you have missed a
                  significant opportunity to reduce your lifetime tax burden.
                </P>
              </MethodologySection>

              {/* Section 4: Multi-Year Allocation */}
              <MethodologySection id="multi-year" number="04" title="Multi-Year Allocation">
                <P>
                  Lucerna does not optimize one year at a time. It looks across your entire income timeline
                  and finds the cheapest bracket slots across all years, then fills them from cheapest to
                  most expensive. This is what makes multi-year planning so much more powerful than a
                  single-year calculator.
                </P>
                <MultiYearAllocation />
                <SubHeading>How the allocation works</SubHeading>
                <P>
                  The engine enumerates all available bracket capacity in every year of your timeline.
                  It sorts these slots by tax rate (cheapest first), then by year. For any given total
                  conversion budget, it fills the cheapest slots first until the budget is exhausted.
                  Low-income years naturally get the most conversion because they have the most cheap
                  bracket space available.
                </P>
                <SubHeading>Why your income trajectory matters</SubHeading>
                <P>
                  A career break, sabbatical, early retirement, or transition between jobs creates
                  low-income years with abundant cheap bracket space. These windows are often the
                  highest-value conversion opportunities in a lifetime. The multi-year view identifies
                  them automatically.
                </P>
              </MethodologySection>

              {/* Section 5: The Lifetime Model */}
              <MethodologySection id="npv-model" number="05" title="The Lifetime Model">
                <P>
                  The analysis models your full financial timeline from today through the end of retirement.
                  It compares the total after-tax wealth under different conversion schedules using Net Present
                  Value: all future cash flows are discounted back to today&apos;s dollars so the comparison
                  is apples-to-apples.
                </P>
                <NpvTimeline />
                <SubHeading>The four phases</SubHeading>
                <P>
                  <strong>Phase 1: Conversion years.</strong> During your income timeline, the engine models
                  tax payments on conversions, shifts balances from Traditional to Roth, and grows both
                  accounts at the assumed rate.
                </P>
                <P>
                  <strong>Phase 2: Growth to retirement.</strong> After the conversion window closes, both
                  accounts continue compounding untouched until retirement age.
                </P>
                <P>
                  <strong>Phase 3: Retirement distributions.</strong> Traditional withdrawals are taxed.
                  Roth withdrawals are not. If Traditional funds run short, the remainder comes from Roth
                  tax-free. Required Minimum Distributions are enforced.
                </P>
                <P>
                  <strong>Phase 4: Final liquidation.</strong> Any remaining balances are distributed.
                  Traditional balances are taxed; Roth balances are not.
                </P>
                <SubHeading>Why &ldquo;today&apos;s dollars&rdquo;?</SubHeading>
                <P>
                  A dollar 25 years from now buys less than a dollar today. The 5% discount rate converts
                  future savings into present value, preventing the analysis from overstating benefits that
                  are decades away. The &ldquo;estimated lifetime tax savings&rdquo; number in your results
                  reflects real purchasing power, not an inflated future amount.
                </P>
              </MethodologySection>

              {/* Section 6: Optimization Approach */}
              <MethodologySection id="optimization" number="06" title="Optimization Approach">
                <P>
                  Finding the best conversion schedule across multiple years with progressive tax brackets is a
                  non-trivial optimization problem. Lucerna uses a two-stage approach: a fast heuristic
                  provides a strong starting point, then a numerical optimizer refines it.
                </P>
                <OptimizationPipeline />
                <SubHeading>Stage 1: Bracket fill heuristic</SubHeading>
                <P>
                  The greedy heuristic estimates your retirement tax rate, then fills every bracket slot below
                  that rate across all years. This runs in milliseconds and produces a good (often near-optimal)
                  schedule. It serves as the starting point for the numerical optimizer and as the fallback if
                  the optimizer does not converge.
                </P>
                <SubHeading>Stage 2: Numerical optimization</SubHeading>
                <P>
                  The engine uses sequential least-squares programming (SLSQP) to search for the conversion
                  schedule that maximizes lifetime after-tax wealth. It tests three different starting points
                  (the heuristic result, a uniform split, and zero conversion) and keeps the best result.
                  This guards against local optima and ensures the final answer is robust.
                </P>
                <SubHeading>Constraints</SubHeading>
                <P>
                  If you set preferences (maximum annual tax cost, minimum number of conversion years, or a
                  per-year cap), the optimizer respects them as hard constraints. It finds the best schedule
                  that satisfies all your requirements, even if the unconstrained optimum would be different.
                </P>
              </MethodologySection>

              {/* Section 7: ACA Subsidy Awareness */}
              <MethodologySection id="aca-subsidies" number="07" title="ACA Subsidy Awareness">
                <P>
                  If you purchase health insurance through the ACA marketplace, Roth conversions can affect
                  your premium subsidy. Conversions increase your Modified Adjusted Gross Income (MAGI),
                  which is the number used to calculate subsidy eligibility. A larger conversion means a
                  smaller subsidy, creating a hidden cost on top of the tax bill.
                </P>
                <AcaSubsidyCurve />
                <SubHeading>The subsidy cliff</SubHeading>
                <P>
                  At 400% of the federal poverty level, ACA premium subsidies drop to zero. This creates
                  a cliff: converting one dollar too many can cost thousands in lost subsidies. When you
                  provide healthcare inputs, the engine includes subsidy impact in its cost calculation
                  and avoids pushing you over the cliff unless the long-term tax benefit clearly outweighs
                  the subsidy loss.
                </P>
                <SubHeading>When this applies</SubHeading>
                <P>
                  This only matters during years when you purchase marketplace insurance. If you have
                  employer coverage or Medicare, conversions do not affect your premiums. The engine
                  models ACA impact only for the years you indicate, leaving other years unaffected.
                </P>
              </MethodologySection>

              {/* Section 8: RMD Impact */}
              <MethodologySection id="rmd-impact" number="08" title="RMD Impact">
                <P>
                  Starting at age 73, the IRS requires you to withdraw a minimum amount from Traditional
                  retirement accounts each year. These Required Minimum Distributions (RMDs) are taxed as
                  ordinary income regardless of whether you need the money. The larger your Traditional
                  balance, the larger your RMDs, and the larger your tax bill.
                </P>
                <RmdComparison />
                <SubHeading>How conversions help</SubHeading>
                <P>
                  Every dollar converted to Roth reduces your future Traditional balance. A smaller
                  Traditional balance means smaller RMDs, which means less forced taxable income in
                  retirement. The engine projects RMD amounts both with and without conversion so you
                  can see the difference.
                </P>
                <SubHeading>Roth accounts have no RMDs</SubHeading>
                <P>
                  Money in a Roth IRA is never subject to Required Minimum Distributions. It continues
                  growing tax-free for as long as you live, providing maximum flexibility in retirement
                  and potentially benefiting heirs.
                </P>
              </MethodologySection>

              {/* Section 9: Assumptions & Limitations */}
              <MethodologySection id="assumptions" number="09" title="Assumptions & Limitations">
                <P>
                  Every projection requires assumptions about the future. The engine uses reasonable
                  defaults based on historical data and standard financial planning conventions. You
                  can adjust growth and discount rates in your scenario inputs. Here is what the analysis
                  assumes and what it does not yet model.
                </P>

                {/* Assumptions table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-glass-border">
                        <th className="text-caption font-ui text-text-tertiary uppercase tracking-wider py-3 pr-4">
                          Assumption
                        </th>
                        <th className="text-caption font-ui text-text-tertiary uppercase tracking-wider py-3 pr-4">
                          Default
                        </th>
                        <th className="text-caption font-ui text-text-tertiary uppercase tracking-wider py-3">
                          Rationale
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {assumptionsData.map((row) => (
                        <tr key={row.assumption} className="border-b border-glass-border/50">
                          <td className="text-body-sm text-text-primary py-3 pr-4 font-medium">
                            {row.assumption}
                          </td>
                          <td className="text-body-sm text-accent py-3 pr-4 font-mono font-bold">
                            {row.value}
                          </td>
                          <td className="text-body-sm text-text-secondary py-3">
                            {row.rationale}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <SubHeading>What is not modeled</SubHeading>
                <P>
                  Social Security taxation, Medicare surcharges (IRMAA), and the net investment income
                  tax (NIIT) are not yet included. These could shift the optimal amount in either
                  direction depending on your situation. Inflation adjustments to future tax brackets
                  are also not modeled: the analysis uses current-year brackets throughout.
                </P>

                <SubHeading>Important disclaimer</SubHeading>
                <P>
                  Lucerna is an educational tool for scenario analysis. It does not provide financial,
                  tax, or investment advice. The analysis is based on the inputs you provide and the
                  assumptions described above. Tax laws change. Consult a qualified professional before
                  making financial decisions.
                </P>
              </MethodologySection>

              {/* Footer CTA */}
              <div className="border-t border-border pt-section-lg">
                <MethodologyFooterCTA />
              </div>

              {/* Legal footer */}
              <footer className="pb-page">
                <p className="text-body-sm text-text-tertiary">
                  Lucerna is an educational tool for scenario analysis. It does not
                  provide financial, tax, or investment advice. Consult a qualified
                  professional before making financial decisions.
                </p>
              </footer>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
