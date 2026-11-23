import type { Meta, StoryObj } from "@storybook/react";
import { BracketFillChart, ConversionStrip } from "@lucerna/ui";
import { bracketFill, resultCard, socialSecurityResultDetails } from "../fixtures";

const meta: Meta = {
  title: "Shared cards/Charts",
};

export default meta;
type Story = StoryObj;

export const BracketFill: Story = {
  render: () => <BracketFillChart data={bracketFill} />,
};

export const BracketFillUnframed: Story = {
  render: () => <BracketFillChart data={bracketFill} framed={false} />,
};

/** Every part a bar can have: withdrawals for spending, required withdrawals from 75 and
 * the taxable part of Social Security right under the conversion. The 65+ deductions
 * come off the bottom of each bar (tap a bar to see them). */
export const BracketFillWithSocialSecurity: Story = {
  render: () => <BracketFillChart data={socialSecurityResultDetails.bracket_fill!} />,
};

/** Data from before the chart knew about withdrawals and Social Security: income, required
 * withdrawal and conversion only. */
export const BracketFillOlderData: Story = {
  render: () => (
    <BracketFillChart
      data={{
        ...bracketFill,
        years: bracketFill.years.map(({ year, age, income, rmd, conversion, tax }) => ({
          year,
          age,
          income,
          rmd,
          conversion,
          tax,
        })),
      }}
    />
  ),
};

/** The small bar strip inside ResultCard. Hover or focus a bar for its year. */
export const Conversions: Story = {
  render: () => (
    <div className="card max-w-md">
      <ConversionStrip schedule={resultCard.schedule_by_year} />
    </div>
  ),
};
