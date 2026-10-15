import type { Meta, StoryObj } from "@storybook/react";
import { AccountMenu } from "./AccountMenu";

const meta: Meta<typeof AccountMenu> = {
  title: "Common/AccountMenu",
  component: AccountMenu,
  parameters: { layout: "padded" },
  args: {
    account: { name: "Barry", email: "you@example.com" },
    onSignOut: () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex h-[260px] justify-end">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AccountMenu>;

/** The avatar in the signed-in header. Click it for the menu. */
export const Default: Story = {};

/** Open: who's signed in, My scenarios, Account settings and Sign out. */
export const Open: Story = { args: { defaultOpen: true } };

/** No name on the account: the email stands in. */
export const EmailOnly: Story = {
  args: { account: { name: "", email: "planner@example.com" }, defaultOpen: true },
};
