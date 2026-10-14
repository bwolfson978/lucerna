import type { Meta, StoryObj } from "@storybook/react";
import { ErrorNotice } from "./ErrorNotice";

const meta: Meta<typeof ErrorNotice> = {
  title: "Common/ErrorNotice",
  component: ErrorNotice,
  args: { onRetry: () => {} },
};

export default meta;
type Story = StoryObj<typeof ErrorNotice>;

export const Default: Story = {};

export const WithErrorDigest: Story = { args: { digest: "1234567890" } };
