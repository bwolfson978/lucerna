import type { Meta, StoryObj } from "@storybook/react";
import { Steps } from "@lucerna/ui";

const meta: Meta<typeof Steps> = {
  title: "Shared cards/Steps",
  component: Steps,
  decorators: [
    (Story) => (
      <div className="max-w-[680px] text-[16px] leading-relaxed text-ink-soft">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Steps>;

/** How the assistant lays out an ordered sequence, such as the phases of a schedule. */
export const Default: Story = {
  args: {
    steps: [
      {
        title: "Fill the low brackets while income is small",
        meta: "2026 to 2027 · about $183,800 a year",
        body: "With only about $20,000 of income, each conversion fills the 12% bracket and most of the 22% bracket.",
      },
      {
        title: "Taper before Social Security starts",
        meta: "2028 to 2029",
        body: "Conversions shrink so income stays below the next Medicare premium threshold.",
      },
      {
        title: "Required withdrawals stay modest",
        body: "Without conversions the peak would be much higher, much of it in the 32% bracket.",
      },
    ],
  },
};

export const TitlesOnly: Story = {
  args: {
    steps: [
      { title: "Record your scenario" },
      { title: "Run the analysis" },
      { title: "Compare a what-if" },
    ],
  },
};
