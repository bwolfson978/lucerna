import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline", "ghost", "destructive", "link"],
    },
    size: {
      control: "select",
      options: ["default", "sm", "lg", "icon"],
    },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: "Analyze scenario" },
};

export const Outline: Story = {
  args: { children: "+ Add year", variant: "outline" },
};

export const Ghost: Story = {
  args: { children: "Cancel", variant: "ghost" },
};

export const Destructive: Story = {
  args: { children: "Delete", variant: "destructive" },
};

export const Loading: Story = {
  args: { children: "Running analysis…", loading: true },
};

export const Disabled: Story = {
  args: { children: "Submit", disabled: true },
};

export const Small: Story = {
  args: { children: "Small button", size: "sm" },
};

export const Large: Story = {
  args: { children: "Large button", size: "lg" },
};
