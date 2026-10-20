import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ScenarioSummary, type ScenarioValues } from "@lucerna/ui";
import { fn, userEvent, within } from "storybook/test";
import { recordedScenario } from "../fixtures";

const meta: Meta<typeof ScenarioSummary> = {
  title: "Shared cards/ScenarioSummary",
  component: ScenarioSummary,
  parameters: {
    docs: {
      description: {
        component: "The scenario as recorded so far (`prepare_scenario`).",
      },
    },
  },
  args: { data: recordedScenario },
};

export default meta;
type Story = StoryObj<typeof ScenarioSummary>;

export const ReadOnly: Story = {};

/** Social Security and a pension recorded as income sources. Current income stops at 66. */
export const WithIncomeSources: Story = {
  args: {
    data: {
      ...recordedScenario,
      scenario: {
        ...recordedScenario.scenario,
        filing_status: "married_filing_jointly",
        current_income: 20000,
        current_income_end_age: 66,
        retirement_spending: 95000,
        income_sources: [
          { kind: "social_security", owner: "you", amount: 46000, start_age: 67 },
          { kind: "social_security", owner: "spouse", amount: 14000, start_age: 68 },
          { kind: "pension", owner: "you", amount: 12000, start_age: 65, end_age: 80 },
        ],
      },
    },
    onEdit: fn(),
    onOpenForm: fn(),
  },
};

/** Already retired: no income from work, Social Security starting next year. */
export const RetiredNoWorkIncome: Story = {
  args: {
    data: {
      ...recordedScenario,
      scenario: {
        ...recordedScenario.scenario,
        age: 66,
        filing_status: "married_filing_jointly",
        current_income: 0,
        traditional_balance: 2600000,
        roth_balance: 80000,
        retirement_age: 65,
        retirement_spending: 130000,
        state: "FL",
        income_sources: [
          { kind: "social_security", owner: "you", amount: 42000, start_age: 67 },
          { kind: "social_security", owner: "spouse", amount: 30000, start_age: 67 },
        ],
      },
    },
  },
};

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

/** A summary already run, further up the conversation: one line until opened. */
export const Collapsed: Story = {
  args: { badge: "Confirmed", collapsible: true },
};

/** The assumptions row opened: income growth, plan horizon, return and inflation. */
export const AssumptionsOpen: Story = {
  args: { onEdit: fn() },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Assumptions/ }));
  },
};

/**
 * The scenario panel beside the conversation on the website: one column, no header, and
 * "Add" on the values still missing. Fields the assistant just filled in are marked New.
 */
export const Panel: Story = {
  render: (args) => (
    <div className="w-[400px] border border-border">
      <ScenarioSummary {...args} />
    </div>
  ),
  args: {
    variant: "panel",
    data: {
      ...recordedScenario,
      scenario: { ...recordedScenario.scenario, age: null, state: null },
    },
    highlight: ["traditional_balance", "retirement_age"],
    onEdit: fn(),
    onOpenForm: fn(),
  },
};
