import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { NumericField } from "./NumericField";
import { CurrencyInput } from "./CurrencyInput";

const meta: Meta<typeof NumericField> = {
  title: "Common/NumericField",
  component: NumericField,
};

export default meta;
type Story = StoryObj<typeof NumericField>;

function Controlled(props: Omit<React.ComponentProps<typeof NumericField>, "value" | "onChange">) {
  const [value, setValue] = useState<number | "">(3);
  return (
    <div className="max-w-sm">
      <NumericField {...props} value={value} onChange={(v) => setValue(v ?? "")} />
    </div>
  );
}

export const Default: Story = {
  render: () => <Controlled label="Age" placeholder="e.g. 35" required />,
};

/** A unit inside the box (not part of the value), as on the form's rates. */
export const WithUnit: Story = {
  render: () => <Controlled label="Yearly income growth" unit="%" decimalScale={1} />,
};

/** Dollar amounts use CurrencyInput, with the $ on the left. */
export const Currency: StoryObj = {
  render: () => (
    <div className="max-w-sm">
      <CurrencyInput label="Current income" value={120000} onChange={() => {}} required />
    </div>
  ),
};
