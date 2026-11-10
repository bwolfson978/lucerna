import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ConversionSlider } from "@lucerna/ui";
import { resultCard, resultDetails } from "../fixtures";

const optimal = resultCard.total_conversion;

const meta: Meta<typeof ConversionSlider> = {
  title: "Shared cards/ConversionSlider",
  component: ConversionSlider,
  parameters: {
    docs: {
      description: {
        component:
          'The total amount to convert, on a track that deepens to pine where savings are highest, with a diamond at the most savings. The words "Most savings" live beside the headline (MostSavingsNote). In the result card (web chat, Claude, ChatGPT) and on the full results page.',
      },
    },
  },
  args: {
    min: 0,
    max: 900000,
    optimalValue: optimal,
    maxLabel: "$900K, your whole balance",
    savings: resultDetails.curve?.points,
  },
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

/** At the total with the most savings: the diamond sits in the thumb. */
export const AtMostSavings: Story = { args: { value: optimal } };

/** Moved away: the diamond stays on the track where the savings peak. */
export const ConvertingLess: Story = { args: { value: 180000 } };

/** The most savings at the end of the track. */
export const BestNearTheEnd: Story = {
  args: {
    value: 1426300,
    max: 1450000,
    optimalValue: 1426300,
    maxLabel: undefined,
    savings: [
      { total: 0, savings: 0 },
      { total: 700000, savings: 150000 },
      { total: 1426300, savings: 393574 },
      { total: 1450000, savings: 390000 },
    ],
  },
};

/** Without the savings curve: a plain track filled up to the thumb. */
export const WithoutCurve: Story = { args: { value: 600000, savings: undefined } };

/** Narrow, as on the full results page beside the headline. */
export const Narrow: Story = {
  args: { value: 600000 },
  decorators: [(Story) => <div className="w-[320px]">{Story()}</div>],
};
