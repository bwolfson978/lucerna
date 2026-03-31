import type { Meta, StoryObj } from "@storybook/react";
import { MetricCard } from "./MetricCard";

const meta: Meta<typeof MetricCard> = {
  title: "Common/MetricCard",
  component: MetricCard,
};

export default meta;
type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {
  args: { label: "Total conversion", value: "$150,000" },
};

export const WithPositiveDelta: Story = {
  args: {
    label: "Estimated lifetime tax savings",
    value: "$42,300",
    delta: "+$42,300 vs. no conversion",
    deltaType: "positive",
  },
};

export const WithNegativeDelta: Story = {
  args: {
    label: "Tax on conversions",
    value: "$33,000",
    delta: "Paid over 3 years",
    deltaType: "negative",
  },
};

export const WithNeutralDelta: Story = {
  args: {
    label: "Conversion years",
    value: "3",
    delta: "2026–2028",
    deltaType: "neutral",
  },
};
