import type { Meta, StoryObj } from "@storybook/react";
import { MCP_SERVER_URL } from "@/lib/utils/constants";
import { CopyField } from "./CopyField";

const meta: Meta<typeof CopyField> = {
  title: "Common/CopyField",
  component: CopyField,
  parameters: { layout: "padded" },
  args: { value: MCP_SERVER_URL, label: "server URL" },
};

export default meta;
type Story = StoryObj<typeof CopyField>;

/** The MCP server URL on the Claude and ChatGPT page. Long values wrap on phones. */
export const Default: Story = {};
