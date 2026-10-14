import type { Meta, StoryObj } from "@storybook/react";
import { BracketFillChart, ConversionStrip } from "@lucerna/ui";
import { bracketFill, resultCard } from "../fixtures";

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

/** The small bar strip inside ResultCard. Hover or focus a bar for its year. */
export const Conversions: Story = {
  render: () => (
    <div className="card max-w-md">
      <ConversionStrip schedule={resultCard.schedule_by_year} />
    </div>
  ),
};
