import { fireEvent, render, screen } from "@testing-library/react";
import { CopyField } from "../CopyField";

describe("CopyField", () => {
  it("copies the value and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyField value="https://example.com/mcp" label="server URL" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy server URL" }));

    expect(writeText).toHaveBeenCalledWith("https://example.com/mcp");
    expect(await screen.findByRole("button", { name: "Copied server URL" })).toHaveTextContent(
      "Copied"
    );
  });

  it("keeps the value on screen when the clipboard is blocked", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) } });
    render(<CopyField value="https://example.com/mcp" label="server URL" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy server URL" }));

    expect(await screen.findByText("https://example.com/mcp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy server URL" })).toBeInTheDocument();
  });
});
