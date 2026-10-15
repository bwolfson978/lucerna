import type { Meta, StoryObj } from "@storybook/react";
import { AccountSettings } from "./AccountSettings";

const meta: Meta<typeof AccountSettings> = {
  title: "Account/AccountSettings",
  component: AccountSettings,
  parameters: { layout: "padded" },
  args: {
    profile: { name: "Barry", email: "you@example.com", signIn: "Google" },
    data: { count: 8, lastSaved: "2026-10-14T18:00:00Z" },
    onManageSignIn: () => {},
    onDownload: () => {},
    onDelete: () => new Promise(() => {}),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-content py-section">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AccountSettings>;

/** Profile, your data and the delete card, with section links on the left (on top on phones). */
export const Default: Story = {};

/** Delete account opened: type the phrase to unlock the button. */
export const DeleteDialog: Story = { args: { deleteDialogOpen: true } };

/** A new account with nothing saved. */
export const NothingSaved: Story = {
  args: { data: { count: 0, lastSaved: null } },
};

/** Saved scenarios couldn't load. */
export const DataFailed: Story = {
  args: { data: { count: null, lastSaved: null, failed: true }, onRetryData: () => {} },
};
