import type { Meta, StoryObj } from "@storybook/react";
import { ResultCard } from "@lucerna/ui";
import { fn } from "storybook/test";
import { previousResultCard, previousResultDetails, resultCard, resultDetails } from "../fixtures";

const meta: Meta<typeof ResultCard> = {
  title: "Shared cards/ResultCard",
  component: ResultCard,
  parameters: {
    docs: {
      description: {
        component:
          "Headline result of an analysis. Shown in the web chat and as the `analyze_roth_conversions` MCP View.",
      },
    },
  },
  args: { data: resultCard },
};

export default meta;
type Story = StoryObj<typeof ResultCard>;

/** As a View in Claude or ChatGPT: links out to the full results page. */
export const WithFullResultsLink: Story = {
  args: { onOpenFullResults: fn() },
};

/** With the tax bracket chart and the slider from the View's `_meta`. Move the slider to
 * see the savings, the chart and the "Ask about" button change. */
export const WithSlider: Story = {
  args: { details: resultDetails, onOpenFullResults: fn(), onAsk: fn() },
};

/** A result from before the slider: the chart without a curve. */
export const WithoutCurve: Story = {
  args: { details: { bracket_fill: resultDetails.bracket_fill } },
};

/** Tool output from the previous release: no chart, and it must not crash. */
export const PreviousRelease: Story = {
  args: { data: previousResultCard, details: previousResultDetails },
};
