import { render, screen } from "@testing-library/react";
import { AssistantChatPreview } from "../AssistantChatPreview";

describe("AssistantChatPreview", () => {
  it("shows the question, the tool call and the engine's result card", () => {
    render(<AssistantChatPreview />);
    expect(screen.getByText(/Should I look at Roth conversions\?/)).toBeInTheDocument();
    expect(screen.getByText("Roth Conversions Optimizer")).toBeInTheDocument();
    expect(screen.getByText("Estimated lifetime tax savings")).toBeInTheDocument();
    // The reply is built from the same result, so its numbers match the card.
    expect(screen.getByText(/spreads conversions over 26 years/)).toHaveTextContent(
      "10% and 12% brackets"
    );
  });
});
