import type { Meta, StoryObj } from "@storybook/react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "UI/Collapsible",
  component: Collapsible,
};

export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Default: Story = {
  render: () => (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-body-sm text-text-secondary hover:text-text-primary transition-colors duration-150">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform duration-150 group-data-[state=open]:rotate-90">
            <path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Advanced settings
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-default grid grid-cols-3 gap-default">
          <div className="h-20 bg-bg-alt rounded-md flex items-center justify-center text-text-tertiary text-body-sm">
            Field 1
          </div>
          <div className="h-20 bg-bg-alt rounded-md flex items-center justify-center text-text-tertiary text-body-sm">
            Field 2
          </div>
          <div className="h-20 bg-bg-alt rounded-md flex items-center justify-center text-text-tertiary text-body-sm">
            Field 3
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
