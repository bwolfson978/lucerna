import { render } from "@testing-library/react";
import { Markdown } from "../Markdown";

function html(text: string) {
  return render(<Markdown text={text} />).container;
}

describe("Markdown", () => {
  it("renders a lead-in sentence and the list beneath it as a paragraph and a list", () => {
    const el = html(
      "**The schedule.** It converts in all ten years.\n- 2026: $183,800.\n- 2027: $122,500."
    );
    expect(el.querySelector("p")?.textContent).toBe("The schedule. It converts in all ten years.");
    const items = [...el.querySelectorAll("ul li")].map((li) => li.textContent);
    expect(items).toEqual(["2026: $183,800.", "2027: $122,500."]);
    expect(el.textContent).not.toContain("- ");
  });

  it("returns to a paragraph after a list in the same block", () => {
    const el = html("Steps:\n1. Convert.\n2. Pay the tax.\nThat is the plan.");
    expect(el.querySelectorAll("p")).toHaveLength(2);
    expect(el.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("joins an indented continuation line to its list item", () => {
    const el = html("- The analysis is federal only\n  and assumes no ACA coverage.");
    expect(el.querySelector("li")?.textContent).toBe(
      "The analysis is federal only and assumes no ACA coverage."
    );
  });

  it("keeps bold text at the start of a line out of the bullet list", () => {
    const el = html("**Caveats.**\n- One.");
    expect(el.querySelector("p strong")?.textContent).toBe("Caveats.");
    expect(el.querySelectorAll("li")).toHaveLength(1);
  });
});
