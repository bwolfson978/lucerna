import type { Meta, StoryObj } from "@storybook/react";
import { AccountDeleted } from "./AccountDeleted";

const meta: Meta<typeof AccountDeleted> = {
  title: "Account/AccountDeleted",
  component: AccountDeleted,
  parameters: { layout: "padded" },
  args: { scenarioCount: 8 },
};

export default meta;
type Story = StoryObj<typeof AccountDeleted>;

/** What Account settings turns into once the account is deleted and the person is signed out. */
export const Default: Story = {};
