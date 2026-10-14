import type { Meta, StoryObj } from "@storybook/react";
import { DeleteAccountCard } from "./DeleteAccountCard";

const meta: Meta<typeof DeleteAccountCard> = {
  title: "Common/DeleteAccountCard",
  component: DeleteAccountCard,
  parameters: {
    layout: "padded",
  },
  args: {
    onDelete: () => new Promise(() => {}),
  },
};

export default meta;
type Story = StoryObj<typeof DeleteAccountCard>;

/** Click "Delete my account" to see the confirm step. */
export const Default: Story = {};

/** What a failed deletion shows after confirming. */
export const Failure: Story = {
  args: { onDelete: () => Promise.reject(new Error("Clerk refused")) },
};
