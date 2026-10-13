import type { Meta, StoryObj } from "@storybook/react";
import { MetricCard, Stat } from "@lucerna/ui";

const meta: Meta<typeof MetricCard> = {
  title: "Shared cards/MetricCard",
  component: MetricCard,
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {
  args: { label: "Total conversion", value: "$150,000" },
};

export const PositiveDelta: Story = {
  args: {
    label: "Estimated lifetime tax savings",
    value: "$42,300",
    delta: "+$42,300 vs. no conversion",
    deltaType: "positive",
  },
};

export const NegativeDelta: Story = {
  args: {
    label: "Tax on conversions",
    value: "$33,000",
    delta: "Paid over 3 years",
    deltaType: "negative",
  },
};

export const NeutralDelta: Story = {
  args: { label: "Conversion years", value: "3", delta: "2026 to 2028", deltaType: "neutral" },
};

/** The smaller labeled number used inside cards. */
export const Stats: StoryObj = {
  render: () => (
    <div className="card grid max-w-md grid-cols-3 gap-default">
      <Stat label="Tax on conversion" value="$22,000" />
      <Stat label="Saved" value="$86,301" tone="positive" />
      <Stat label="Lost" value="-$4,259" tone="negative" />
    </div>
  ),
};
