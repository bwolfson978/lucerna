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

/**
 * Signed out: "Sign in" sits before the main action and opens Clerk's window, which links
 * to creating an account. The phone menu offers both. (The app shows these only with Clerk;
 * setting isSignedIn shows them here, inert.)
 */
export const SignedOut: Story = {
  args: { isSignedIn: false },
};

/** On the calculator the header drops its "Run your scenario" button. */
export const OnCalculator: Story = {
  parameters: { nextjs: { navigation: { pathname: "/calculator" } } },
};

/**
 * Signed in: the account avatar sits at the end, with My scenarios, Account settings and
 * Sign out. On phones the avatar stays in the top bar and the menu ends with the same items.
 */
export const SignedIn: Story = {
  args: { isSignedIn: true, account: { name: "Barry", email: "you@example.com" } },
};

/** The account menu open. */
export const AccountMenuOpen: Story = {
  args: {
    isSignedIn: true,
    account: { name: "Barry", email: "you@example.com" },
    accountMenuOpen: true,
  },
  decorators: [
    (Story) => (
      <div className="min-h-[320px]">
        <Story />
      </div>
    ),
  ],
};

/**
 * The fullest nav: signed in on a page with the "How does it work?" sidebar (the Demo page).
 * The pill shows only its icon so every label stays on one line from lg.
 */
export const SignedInOnDemo: Story = {
  args: { isSignedIn: true, account: { name: "Barry", email: "you@example.com" } },
  parameters: { nextjs: { navigation: { pathname: "/demo" } } },
  decorators: [
    (Story) => (
      <MethodologyProvider>
        <Story />
      </MethodologyProvider>
    ),
  ],
};
