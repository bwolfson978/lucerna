import type { Meta, StoryObj } from "@storybook/react";
import { FormField } from "./FormField";

const meta: Meta<typeof FormField> = {
  title: "Common/FormField",
  component: FormField,
};

export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  args: { label: "Current income", type: "number", numeric: true, placeholder: "0" },
};

export const WithHelper: Story = {
  args: {
    label: "Traditional IRA balance",
    type: "number",
    numeric: true,
    helper: "Includes 401k rollovers",
    placeholder: "0",
  },
};

export const WithError: Story = {
  args: {
    label: "Age",
    type: "number",
    numeric: true,
    value: "95",
    error: "Age must be between 18 and 80",
  },
};

export const WithValue: Story = {
  args: {
    label: "Investment return (%)",
    type: "number",
    numeric: true,
    value: "7",
    helper: "Expected annual return",
  },
};
