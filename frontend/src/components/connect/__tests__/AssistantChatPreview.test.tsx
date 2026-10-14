import { render, screen } from "@testing-library/react";
import fixture from "../../../../../shared/fixtures/view-data.json";
import { AssistantChatPreview } from "../AssistantChatPreview";

const years = fixture.analyze_roth_conversions.structured_content.years_with_conversions;

describe("AssistantChatPreview", () => {
  it("shows the question, the tool call and the engine's result card", () => {
    render(<AssistantChatPreview />);
    expect(screen.getByText(/Should I look at Roth conversions\?/)).toBeInTheDocument();
    expect(screen.getByText("Roth Conversions Optimizer")).toBeInTheDocument();
    expect(screen.getByText("Estimated lifetime tax savings")).toBeInTheDocument();
    // The View's bracket chart, not the plain bar strip.
    expect(screen.getByText("Room left in bracket")).toBeInTheDocument();
    // The reply is built from the same result, so its numbers match the card.
    expect(
      screen.getByText(new RegExp(`spreads conversions over ${years} years`))
    ).toHaveTextContent(/keeps them in the .+ brackets/);
  });
});
