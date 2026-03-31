import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./select";
import { FormSelect } from "@/components/common/FormSelect";

const meta: Meta<typeof Select> = {
  title: "UI/Select",
  component: Select,
};

export default meta;
type Story = StoryObj<typeof Select>;

const filingOptions = [
  { value: "single", label: "Single" },
  { value: "married_filing_jointly", label: "Married filing jointly" },
];

export const Default: Story = {
  args: { options: filingOptions },
};

export const Disabled: Story = {
  args: { options: filingOptions, disabled: true },
};

export const WithFormWrapper: Story = {
  render: () => (
    <FormSelect
      label="Filing status"
      options={filingOptions}
      helper="Select your tax filing status"
    />
  ),
};

export const WithError: Story = {
  render: () => (
    <FormSelect
      label="Filing status"
      options={filingOptions}
      error="Please select a filing status"
    />
  ),
};
