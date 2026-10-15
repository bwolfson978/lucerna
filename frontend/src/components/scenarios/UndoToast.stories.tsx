import type { Meta, StoryObj } from "@storybook/react";
import { UndoToast } from "./UndoToast";

const meta: Meta<typeof UndoToast> = {
  title: "Scenarios/UndoToast",
  component: UndoToast,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    onUndo: () => {},
    onDismiss: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof UndoToast>;

export const OneScenario: Story = {
  args: { message: "Deleted “Baseline: no conversions”" },
};

export const Several: Story = {
  args: { message: "Deleted 3 scenarios" },
};
