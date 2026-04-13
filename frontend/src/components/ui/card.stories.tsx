import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./card";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    children: (
      <div className="flex flex-col gap-2">
        <span className="metric-label">Total conversion</span>
        <span className="metric-value">$150,000</span>
      </div>
    ),
  },
};

export const Recommended: Story = {
  args: {
    recommended: true,
    children: (
      <div className="flex flex-col gap-2">
        <span className="text-h3 text-text-primary">Highest estimated savings</span>
        <span className="text-body text-text-secondary">Convert $50,000 per year for 3 years</span>
      </div>
    ),
  },
};

export const WithStructure: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Bracket fill detail</CardTitle>
        <CardDescription>Federal tax brackets used by conversions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-32 items-center justify-center rounded-md bg-bg-alt text-text-tertiary">
          Chart placeholder
        </div>
      </CardContent>
    </Card>
  ),
};

export const NoPadding: Story = {
  args: {
    className: "p-0",
    children: (
      <div className="p-comfortable">
        <p className="text-body">Card with p-0 override and inner padding</p>
      </div>
    ),
  },
};
