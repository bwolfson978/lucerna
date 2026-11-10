import type { Meta, StoryObj } from "@storybook/react";
import { MostSavingsNote } from "@lucerna/ui";
import { fn } from "storybook/test";

const meta: Meta<typeof MostSavingsNote> = {
  title: "Shared cards/MostSavingsNote",
  component: MostSavingsNote,
  parameters: {
    docs: {
      description: {
        component:
          "The line under a savings headline that says where the conversion slider stands. Its diamond is the one that marks the most savings on the slider's track. In the result card and on the full results page.",
      },
    },
  },
  args: { shortfall: 0, onBack: fn(), caption: "in today's dollars, compared with not converting" },
};

export default meta;
type Story = StoryObj<typeof MostSavingsNote>;

/** At the amount with the most savings. */
export const AtMostSavings: Story = { args: { atOptimal: true } };

/** At another amount: how much less it saves, and the way back. */
export const AnotherAmount: Story = { args: { atOptimal: false, shortfall: 4210 } };

/** Without a caption, as on the full results page. */
export const NoCaption: Story = { args: { atOptimal: true, caption: undefined } };
