import type { Meta, StoryObj } from "@storybook/react";
import { ScenarioCompareCard } from "@lucerna/ui";
import { fn } from "storybook/test";
import { compare } from "../fixtures";

const meta: Meta<typeof ScenarioCompareCard> = {
  title: "Shared cards/ScenarioCompareCard",
  component: ScenarioCompareCard,
  parameters: {
    docs: {
      description: {
        component: "A what-if next to the current scenario (`compare_roth_scenarios`).",
      },
    },
  },
  args: { data: compare, onApply: fn(), onOpenFullResults: fn() },
};

export default meta;
type Story = StoryObj<typeof ScenarioCompareCard>;

export const Default: Story = {};

export const Applied: Story = {
  args: { applied: true },
};

export const ApplyDisabled: Story = {
  args: { applyDisabled: true },
};

/** Read-only, with no actions (how some hosts show it). */
export const ReadOnly: Story = {
  args: { onApply: undefined, onOpenFullResults: undefined },
};
