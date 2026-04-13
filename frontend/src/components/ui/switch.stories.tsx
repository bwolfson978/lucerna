import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./switch";
import { Label } from "./label";

const meta: Meta<typeof Switch> = {
  title: "UI/Switch",
  component: Switch,
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  args: {},
};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Switch id="aca" defaultChecked />
      <Label htmlFor="aca" className="cursor-pointer text-body text-text-primary">
        I buy health insurance on the ACA marketplace
      </Label>
    </div>
  ),
};
