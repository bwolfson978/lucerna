import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  argTypes: {
    numeric: { control: "boolean" },
    disabled: { control: "boolean" },
    type: { control: "select", options: ["text", "number", "email"] },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: "Enter a value..." },
};

export const Numeric: Story = {
  args: { type: "number", numeric: true, placeholder: "0", value: "85000" },
};

export const Disabled: Story = {
  args: { placeholder: "Disabled", disabled: true },
};
