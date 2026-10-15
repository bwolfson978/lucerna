import type { Meta, StoryObj } from "@storybook/react";
import { DeleteAccountCard } from "./DeleteAccountCard";

const meta: Meta<typeof DeleteAccountCard> = {
  title: "Common/DeleteAccountCard",
  component: DeleteAccountCard,
  parameters: {
    layout: "padded",
  },
  args: {
    scenarioCount: 8,
    onDelete: () => new Promise(() => {}),
    onDownload: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof DeleteAccountCard>;

/** The danger card on Account settings. "Delete account" opens the dialog. */
export const Default: Story = {};

/** The dialog: the delete button stays locked until "delete my account" is typed. */
export const DialogOpen: Story = {
  args: { defaultOpen: true },
};

/** Nothing saved: no scenario line and no download offer. */
export const NoScenarios: Story = {
  args: { scenarioCount: 0, defaultOpen: true },
};

/** Type the phrase and confirm to see the failure message and "Try again". */
export const Failure: Story = {
  args: { defaultOpen: true, onDelete: () => Promise.reject(new Error("Clerk refused")) },
};
