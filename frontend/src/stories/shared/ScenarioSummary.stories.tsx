import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ScenarioSummary, type ScenarioValues } from "@lucerna/ui";
import { fn } from "storybook/test";
import { recordedScenario } from "../fixtures";

const meta: Meta<typeof ScenarioSummary> = {
  title: "Shared cards/ScenarioSummary",
  component: ScenarioSummary,
  parameters: {
    docs: {
      description: {
        component: "The scenario as recorded so far (`record_scenario`).",
      },
    },
  },
  args: { data: recordedScenario },
};

export default meta;
type Story = StoryObj<typeof ScenarioSummary>;

export const ReadOnly: Story = {};

export const StillNeedsInputs: Story = {
  args: { missing: ["age", "retirement_age"] },
};

/** Click a value to edit it inline. */
export const Editable: Story = {
  args: { onEdit: fn(), onRun: fn(), onOpenForm: fn() },
};

export const RunDisabled: Story = {
  args: {
    onEdit: fn(),
    onRun: fn(),
    runDisabled: true,
    hint: "Add your age to run the analysis.",
  },
};

/** Edits apply to the card. Click State to change today's and the retirement state in place. */
export const Interactive: Story = {
  render: function Render(args) {
    const [scenario, setScenario] = useState<ScenarioValues>(args.data.scenario);
    return (
      <ScenarioSummary
        {...args}
        data={{ ...args.data, scenario }}
        onEdit={(patch) =>
          // As the draft does: a new state alone also moves the retirement state.
          setScenario((s) => ({
            ...s,
            ...("state" in patch && !("retirement_state" in patch)
              ? { retirement_state: patch.state }
              : {}),
            ...patch,
          }))
        }
      />
    );
  },
  args: { onRun: fn() },
};
