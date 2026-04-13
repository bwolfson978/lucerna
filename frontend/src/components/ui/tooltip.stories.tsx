import type { Meta, StoryObj } from "@storybook/react";
import { Tooltip } from "@/components/common/Tooltip";
import { TooltipProvider } from "./tooltip";

const meta: Meta<typeof Tooltip> = {
  title: "UI/Tooltip",
  component: Tooltip,
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <div className="flex items-center justify-center p-16">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const InfoIcon: Story = {
  args: { content: "Estimated lifetime tax savings from the selected Roth conversion schedule" },
};

export const WithChild: Story = {
  args: {
    content: "Click to view detailed bracket breakdown",
    children: <span className="cursor-pointer text-accent underline">Hover me</span>,
  },
};

export const LongContent: Story = {
  args: {
    content:
      "This analysis shows the projected impact on your after-tax wealth in today's dollars, accounting for investment growth, tax rates, and the time value of money across your full retirement horizon.",
  },
};
