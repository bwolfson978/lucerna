import type { OptimizationResult } from "@/lib/types";

export interface MethodologySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-accent">
      {children}
    </h4>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] leading-relaxed text-text-secondary">{children}</p>;
}

export function getSections(_result?: OptimizationResult): MethodologySection[] {
  return [
    {
      id: "savings-number",
      title: "Your Savings Number",
      content: (
        <>
          <P>
            This is the difference in your after-tax wealth between converting the recommended
            amount and converting nothing &mdash; expressed in today&apos;s dollars so it reflects
            real purchasing power.
          </P>
          <SectionHeading>Why &ldquo;today&apos;s dollars?&rdquo;</SectionHeading>
          <P>
            A dollar 20 years from now buys less than a dollar today. We discount future savings at
            5% so the number reflects what that money is actually worth to you right now, not an
            inflated future amount.
          </P>
          <SectionHeading>What&apos;s included</SectionHeading>
          <P>
            We model your full financial timeline: the tax cost of conversions now, growth in both
            accounts over time, retirement withdrawals (traditional is taxed, Roth is not), and any
            remaining balance. The savings number is the gap between converting optimally and not
            converting at all.
          </P>
        </>
      ),
    },
    {
      id: "bracket-filling",
      title: "Tax Bracket Filling",
      content: (
        <>
          <P>
            Tax brackets are &ldquo;buckets&rdquo; that fill from the bottom up. Your regular income
            fills the lowest brackets first. Conversions then fill the next available space.
          </P>
          <SectionHeading>Where the analysis stops</SectionHeading>
          <P>
            The analysis stops converting when the cost of entering the next bracket exceeds the
            long-term benefit. Converting into a bracket that&apos;s cheaper than your expected
            retirement rate saves money. Going higher costs more than it saves.
          </P>
          <SectionHeading>Why this changes year to year</SectionHeading>
          <P>
            In years when your income is lower, there&apos;s more room in cheaper brackets &mdash;
            so the analysis places more conversion there. This is why your income trajectory matters
            so much.
          </P>
        </>
      ),
    },
    {
      id: "conversion-tradeoff",
      title: "The Conversion Trade-Off",
      content: (
        <>
          <P>
            Every conversion involves a trade-off: pay tax now at your current rate, or pay tax
            later at your retirement rate. The optimal amount is where the cost of converting one
            more dollar roughly equals the benefit.
          </P>
          <SectionHeading>Why not convert everything?</SectionHeading>
          <P>
            Converting your entire IRA at once pushes income into higher tax brackets. You&apos;d
            pay more in tax today than the optimal strategy &mdash; tax that doesn&apos;t get
            recovered by future tax-free growth.
          </P>
          <SectionHeading>Why not convert nothing?</SectionHeading>
          <P>
            Leaving everything in traditional means paying tax on every dollar in retirement &mdash;
            likely at rates similar to or higher than your current low brackets. You&apos;d miss
            significant potential savings.
          </P>
        </>
      ),
    },
    {
      id: "multi-year-allocation",
      title: "Multi-Year Allocation",
      content: (
        <>
          <P>
            When you adjust the total conversion amount, the analysis doesn&apos;t divide it evenly
            across years. It prioritizes your lowest-income years where bracket space is cheapest.
          </P>
          <SectionHeading>How redistribution works</SectionHeading>
          <P>
            Low-income years get filled first because each dollar converted costs less in tax. Only
            when those years are full does the analysis spill into higher-income years. This means
            even a &ldquo;suboptimal&rdquo; total is allocated as efficiently as possible.
          </P>
          <SectionHeading>Your timeline</SectionHeading>
          <P>
            The analysis places most of your conversion in the years where your income is lowest,
            taking advantage of the bracket room available in those years.
          </P>
        </>
      ),
    },
    {
      id: "assumptions-limitations",
      title: "Assumptions & Limitations",
      content: (
        <>
          <P>
            Every projection requires assumptions about the future. Here&apos;s what we use and why
            they&apos;re reasonable &mdash; but not guaranteed.
          </P>
          <SectionHeading>7% annual growth</SectionHeading>
          <P>
            The historical average real return of a diversified stock portfolio. Your actual returns
            will vary year to year, but this is a widely-used baseline for long-term planning.
          </P>
          <SectionHeading>5% discount rate</SectionHeading>
          <P>
            How we convert future dollars to today&apos;s dollars. A moderate assumption that avoids
            overstating benefits.
          </P>
          <SectionHeading>What&apos;s not included</SectionHeading>
          <P>
            Social Security benefits and income are not modeled. IRMAA surcharges are factored in
            during optimization but are not a direct user input. These omissions could shift the
            optimal amount depending on your situation.
          </P>
        </>
      ),
    },
  ];
}

const sectionLabels: Record<string, string> = {
  "savings-number": "Your Savings Number",
  "bracket-filling": "Tax Bracket Filling",
  "conversion-tradeoff": "The Conversion Trade-Off",
  "multi-year-allocation": "Multi-Year Allocation",
  "assumptions-limitations": "Assumptions & Limitations",
};

export function getSectionLabel(sectionId: string): string {
  return sectionLabels[sectionId] ?? sectionId;
}
