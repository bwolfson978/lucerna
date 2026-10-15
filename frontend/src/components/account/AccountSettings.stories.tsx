import type { Meta, StoryObj } from "@storybook/react";
import { Header } from "@/components/common/Header";
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
};

export default meta;
type Story = StoryObj<typeof AccountSettings>;

const contained: Story["decorators"] = [
  (Story) => (
    <div className="mx-auto max-w-content py-section">
      <Story />
    </div>
  ),
];

/** Profile, your data and the delete card, with section links on the left (on top on phones). */
export const Default: Story = { decorators: contained };

/** Delete account opened: type the phrase to unlock the button. */
export const DeleteDialog: Story = { args: { deleteDialogOpen: true }, decorators: contained };

/** A new account with nothing saved. */
export const NothingSaved: Story = {
  args: { data: { count: 0, lastSaved: null } },
  decorators: contained,
};

/** Saved scenarios couldn't load. */
export const DataFailed: Story = {
  args: { data: { count: null, lastSaved: null, failed: true }, onRetryData: () => {} },
  decorators: contained,
};

/** The page as it appears at /account, under the signed-in header. */
export const InPage: Story = {
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/account" } } },
  decorators: [
    (Story) => (
      <>
        <Header isSignedIn account={{ name: "Barry", email: "you@example.com" }} />
        <main className="px-default py-section-lg md:px-page">
          <div className="mx-auto max-w-content">
            <Story />
          </div>
        </main>
      </>
    ),
  ],
};
