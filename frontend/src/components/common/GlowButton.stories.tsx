import type { Meta, StoryObj } from "@storybook/react";
import { GlowButton } from "./GlowButton";

const meta: Meta<typeof GlowButton> = {
  title: "Common/GlowButton",
  component: GlowButton,
};

export default meta;
type Story = StoryObj<typeof GlowButton>;

export const Default: Story = {
  args: { children: "Analyze my scenario" },
};

export const Loading: Story = {
  args: { children: "Running analysis…", loading: true },
};

export const Disabled: Story = {
  args: { children: "Analyze my scenario", disabled: true },
};
