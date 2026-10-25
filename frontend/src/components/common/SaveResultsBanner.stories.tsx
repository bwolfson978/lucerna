import type { Meta, StoryObj } from "@storybook/react";
import { SaveResultsBanner } from "./SaveResultsBanner";
import { GlowButton } from "./GlowButton";

const meta: Meta<typeof SaveResultsBanner> = {
  title: "Common/SaveResultsBanner",
  component: SaveResultsBanner,
  parameters: {
    layout: "padded",
  },
  args: {
    signInButton: <GlowButton size="sm">Save with a free account</GlowButton>,
    onDismiss: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SaveResultsBanner>;

export const Prompt: Story = {
  args: { show: true, state: "prompt" },
};

export const Saving: Story = {
  args: { show: true, state: "saving" },
};

export const Saved: Story = {
  args: { show: true, state: "saved" },
};

/** A signed-in save that failed (database blip, expired token). */
export const Failed: Story = {
  args: { show: true, state: "failed", onRetry: () => {} },
};
