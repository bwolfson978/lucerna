import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ConversionSlider } from "@lucerna/ui";
import { resultCard } from "../fixtures";

const optimal = resultCard.total_conversion;

const meta: Meta<typeof ConversionSlider> = {
  title: "Shared cards/ConversionSlider",
  component: ConversionSlider,
  parameters: {
    docs: {
      description: {
        component:
          "The total amount to convert, with the most savings marked on the track. In the result card (web chat, Claude, ChatGPT) and on the full results page.",
      },
    },
  },
  args: { min: 0, max: 900000, optimalValue: optimal, maxLabel: "$900K, your whole balance" },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return (
      <div className="max-w-[560px]">
        <ConversionSlider {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<typeof ConversionSlider>;

/** At the total with the most savings: a badge, and a filled thumb. */
export const AtMostSavings: Story = { args: { value: optimal } };

/** Moved away: a button to go back. */
export const ConvertingLess: Story = { args: { value: 180000 } };

/** The most savings near the end of the track: the tag stays on the track. */
export const BestNearTheEnd: Story = {
  args: { value: 1426300, max: 1450000, optimalValue: 1426300, maxLabel: undefined },
};

/** Narrow, as on the full results page beside the headline. */
export const Narrow: Story = {
  args: { value: 600000 },
  decorators: [(Story) => <div className="w-[320px]">{Story()}</div>],
};
