import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedScenariosTable } from "../SavedScenariosTable";
import { SAMPLE_SCENARIOS } from "../fixtures";

function names() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("link")[0].textContent);
}

describe("SavedScenariosTable", () => {
  it("lists newest first and re-sorts", async () => {
    render(<SavedScenariosTable scenarios={SAMPLE_SCENARIOS} onDelete={vi.fn()} />);
    expect(names()[0]).toBe("Retire at 62, fill the 22% bracket");

    await userEvent.selectOptions(screen.getByLabelText("Sort scenarios"), "savings");
    expect(names()[0]).toBe("Early retirement at 58");

    await userEvent.selectOptions(screen.getByLabelText("Sort scenarios"), "name");
    expect(names()[0]).toBe("Baseline: no conversions");
  });

  it("filters by name and can clear the search", async () => {
    render(<SavedScenariosTable scenarios={SAMPLE_SCENARIOS} onDelete={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Search scenarios"), "single");
    expect(names()).toEqual(["Single, fill through the 24%", "Survivor years, filing single"]);

    await userEvent.clear(screen.getByLabelText("Search scenarios"));
    await userEvent.type(screen.getByLabelText("Search scenarios"), "zzz");
    expect(screen.getByText("No scenarios match your search")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(names()).toHaveLength(SAMPLE_SCENARIOS.length);
  });

  it("deletes one scenario only after confirming", async () => {
    const onDelete = vi.fn();
    render(<SavedScenariosTable scenarios={SAMPLE_SCENARIOS} onDelete={onDelete} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Bridge years before Social Security" })
    );
    const dialog = screen.getByRole("alertdialog", { name: "Delete this scenario?" });
    expect(dialog).toHaveTextContent("“Bridge years before Social Security”");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "More actions for Bridge years before Social Security" })
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete…" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete scenario" }));
    expect(onDelete).toHaveBeenCalledWith(["s2"]);
  });

  it("deletes several from the bulk bar, listing them first", async () => {
    const onDelete = vi.fn();
    render(<SavedScenariosTable scenarios={SAMPLE_SCENARIOS} onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText("Select Single, fill through the 24%"));
    await userEvent.click(screen.getByLabelText("Select Baseline: no conversions"));

    const bar = screen.getByRole("toolbar", { name: "Selected scenarios" });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.click(within(bar).getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete 2 scenarios?" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete 2 scenarios" }));
    expect(onDelete).toHaveBeenCalledWith(["s3", "s4"]);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("selects every visible row from the header checkbox", async () => {
    render(<SavedScenariosTable scenarios={SAMPLE_SCENARIOS} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("Select all scenarios"));
    expect(screen.getByRole("toolbar")).toHaveTextContent(`${SAMPLE_SCENARIOS.length} selected`);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("closes the actions menu with Escape", async () => {
    render(<SavedScenariosTable scenarios={SAMPLE_SCENARIOS} onDelete={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: "More actions for Early retirement at 58" })
    );
    expect(screen.getByRole("menuitem", { name: "Re-run in calculator" })).toHaveAttribute(
      "href",
      "/calculator?saved=s7"
    );
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
