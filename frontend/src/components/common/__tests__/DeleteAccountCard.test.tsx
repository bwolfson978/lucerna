import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountCard } from "../DeleteAccountCard";

async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByRole("alertdialog", { name: "Delete your account?" });
}

describe("DeleteAccountCard", () => {
  it("says how many scenarios go with the account", () => {
    render(<DeleteAccountCard onDelete={vi.fn()} scenarioCount={1} />);
    expect(screen.getByText("1 saved scenario will be deleted with it.")).toBeInTheDocument();
  });

  it("only deletes once the phrase is typed", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<DeleteAccountCard onDelete={onDelete} scenarioCount={3} />);
    const dialog = await openDialog();
    const confirm = within(dialog).getByRole("button", { name: "Delete account" });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/To confirm, type/), "delete my");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/To confirm, type/), " account");
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled", async () => {
    const onDelete = vi.fn();
    render(<DeleteAccountCard onDelete={onDelete} scenarioCount={3} />);
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("explains a failure and offers support", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("nope"));
    render(<DeleteAccountCard onDelete={onDelete} scenarioCount={3} />);
    const dialog = await openDialog();
    await userEvent.type(within(dialog).getByLabelText(/To confirm, type/), "delete my account");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't delete your account");
    expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeEnabled();
  });
});
