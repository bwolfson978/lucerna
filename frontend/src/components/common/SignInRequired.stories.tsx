import type { Meta, StoryObj } from "@storybook/react";
import { SignInRequired } from "./SignInRequired";
import { GlowButton } from "./GlowButton";

const meta: Meta<typeof SignInRequired> = {
  title: "Common/SignInRequired",
  component: SignInRequired,
  parameters: {
    layout: "padded",
  },
  args: {
    signInButton: <GlowButton size="sm">Sign in</GlowButton>,
  },
};

export default meta;
type Story = StoryObj<typeof SignInRequired>;

export const MyScenarios: Story = {
  args: {
    title: "Sign in to see your saved scenarios",
    description: "Scenarios you save here or from a chat app are kept in your free account.",
  },
};

export const SavedScenarioLink: Story = {
  args: {
    title: "Sign in to open this saved scenario",
    description: "It will load here once you're signed in.",
  },
};
