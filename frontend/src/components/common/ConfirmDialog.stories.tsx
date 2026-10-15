import type { Meta, StoryObj } from "@storybook/react";
import { ConfirmDialog, DialogList } from "./ConfirmDialog";

const meta: Meta<typeof ConfirmDialog> = {
  title: "Common/ConfirmDialog",
  component: ConfirmDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    open: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const DeleteOne: Story = {
  args: {
    title: "Delete this scenario?",
    description:
      "“Bridge years before Social Security” and its results will be removed from your account, including from Claude or ChatGPT if you saved it there. You can undo right after.",
    confirmLabel: "Delete scenario",
  },
};

export const DeleteSeveral: Story = {
  args: {
    title: "Delete 3 scenarios?",
    description:
      "These scenarios and their results will be removed from your account, wherever you saved them. You can undo right after.",
    confirmLabel: "Delete 3 scenarios",
    children: (
      <DialogList>
        <li>Single, fill through the 24%</li>
        <li>Baseline: no conversions</li>
        <li>Survivor years, filing single</li>
      </DialogList>
    ),
  },
};
