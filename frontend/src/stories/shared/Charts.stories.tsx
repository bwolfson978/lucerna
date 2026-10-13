import type { Meta, StoryObj } from "@storybook/react";
import { BalanceComparison, BracketFillChart, ConversionStrip } from "@lucerna/ui";
import { balances, bracketFill, resultCard } from "../fixtures";

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

export const Balances: Story = {
  render: () => <BalanceComparison data={balances} />,
};

export const BalancesUnframed: Story = {
  render: () => <BalanceComparison data={balances} framed={false} />,
};

/** The small bar strip inside ResultCard. Hover or focus a bar for its year. */
export const Conversions: Story = {
  render: () => (
    <div className="card max-w-md">
      <ConversionStrip schedule={resultCard.schedule_by_year} />
    </div>
  ),
};
