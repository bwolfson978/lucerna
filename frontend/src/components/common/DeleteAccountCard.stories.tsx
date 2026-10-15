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
    scenarioCount: 8,
  },
};

export default meta;
type Story = StoryObj<typeof DeleteAccountCard>;

/** Click "Delete account" for the confirm dialog, which unlocks once the phrase is typed. */
export const Default: Story = {};

/** Type the phrase and confirm to see what a failed deletion shows. */
export const Failure: Story = {
  args: { onDelete: () => Promise.reject(new Error("Clerk refused")) },
};
