import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { BirthDateField } from "./BirthDateField";

const meta: Meta<typeof BirthDateField> = {
  title: "Common/BirthDateField",
  component: BirthDateField,
  args: { label: "Born", month: null, year: null, required: true, onChange: () => {} },
};

export default meta;
type Story = StoryObj<typeof BirthDateField>;

export const Empty: Story = {};

export const Filled: Story = {
  args: { month: 5, year: 1963, helper: "You turn 63 this year" },
};

export const WithError: Story = {
  args: { error: "Enter the month and year you were born" },
};

export const Spouse: Story = {
  args: { label: "Spouse born", month: 10, year: 1961, helper: "Your spouse turns 65 this year" },
};

function Controlled(args: React.ComponentProps<typeof BirthDateField>) {
  const [value, setValue] = useState<{ month: number | null; year: number | null }>({
    month: null,
    year: null,
  });
  return <BirthDateField {...args} month={value.month} year={value.year} onChange={setValue} />;
}

/** Type a year and pick a month. */
export const Interactive: Story = {
  render: (args) => <Controlled {...args} />,
};
