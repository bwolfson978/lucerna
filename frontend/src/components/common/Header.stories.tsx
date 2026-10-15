import type { Meta, StoryObj } from "@storybook/react";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { Header } from "./Header";

const meta: Meta<typeof Header> = {
  title: "Common/Header",
  component: Header,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};

/** On the calculator the header drops its "Run your scenario" button. */
export const OnCalculator: Story = {
  parameters: { nextjs: { navigation: { pathname: "/calculator" } } },
};

/** Signed in: "My scenarios" and "Sign out" join the nav (and the phone menu). */
export const SignedIn: Story = {
  args: { isSignedIn: true },
};

/**
 * The fullest nav: signed in on a page with the "How does it work?" sidebar (the Demo page).
 * The desktop nav waits for xl and the pill shows only its icon, so no label wraps.
 */
export const SignedInOnDemo: Story = {
  args: { isSignedIn: true },
  parameters: { nextjs: { navigation: { pathname: "/demo" } } },
  decorators: [
    (Story) => (
      <MethodologyProvider>
        <Story />
      </MethodologyProvider>
    ),
  ],
};
