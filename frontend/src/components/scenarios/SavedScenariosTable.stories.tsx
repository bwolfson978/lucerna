import type { Meta, StoryObj } from "@storybook/react";
import { SavedScenariosTable } from "./SavedScenariosTable";
import { SAMPLE_SCENARIOS } from "./fixtures";

const meta: Meta<typeof SavedScenariosTable> = {
  title: "Scenarios/SavedScenariosTable",
  component: SavedScenariosTable,
  parameters: {
    layout: "padded",
  },
  args: {
    scenarios: SAMPLE_SCENARIOS,
    onDelete: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof SavedScenariosTable>;

/** Hover a row for its trash button, open ⋯ for the actions menu, tick rows for the bulk bar. */
export const Default: Story = {};

export const OneScenario: Story = {
  args: { scenarios: SAMPLE_SCENARIOS.slice(0, 1) },
};
