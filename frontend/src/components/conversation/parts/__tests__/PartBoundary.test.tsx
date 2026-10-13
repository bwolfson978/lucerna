import { render, screen } from "@testing-library/react";
import { PartBoundary } from "../PartBoundary";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

function Broken(): never {
  throw new Error("bad card data");
}

it("replaces a card that throws with a notice and keeps its siblings", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <>
      <PartBoundary kind="mcp_app">
        <Broken />
      </PartBoundary>
      <PartBoundary kind="text">
        <p>Still here</p>
      </PartBoundary>
    </>
  );
  expect(screen.getByRole("status")).toHaveTextContent("couldn't be shown");
  expect(screen.getByText("Still here")).toBeInTheDocument();
  spy.mockRestore();
});
