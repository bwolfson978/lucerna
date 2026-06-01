import type { Meta, StoryObj } from "@storybook/react";
import { SaveResultsBanner } from "./SaveResultsBanner";

const meta: Meta<typeof SaveResultsBanner> = {
  title: "Common/SaveResultsBanner",
  component: SaveResultsBanner,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof SaveResultsBanner>;

export const Visible: Story = {
  args: { show: true },
};

export const Hidden: Story = {
  args: { show: false },
};
