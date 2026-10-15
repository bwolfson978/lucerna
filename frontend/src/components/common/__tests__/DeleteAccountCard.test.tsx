import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountCard } from "../DeleteAccountCard";

async function openAndType(text: string) {
  await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
  await userEvent.type(screen.getByLabelText(/To confirm, type/), text);
}

describe("DeleteAccountCard", () => {
  it("says how many scenarios go with the account", () => {
    render(<DeleteAccountCard scenarioCount={8} onDelete={vi.fn()} />);
    expect(screen.getByText(/all 8 saved scenarios/)).toBeInTheDocument();
  });

  it("only deletes once the phrase is typed", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<DeleteAccountCard scenarioCount={8} onDelete={onDelete} />);

    await openAndType("delete my");
    const dialog = screen.getByRole("alertdialog", { name: "Delete your account?" });
    expect(dialog).toHaveTextContent("All 8 saved scenarios, including ones saved from Claude");
    const confirm = screen.getAllByRole("button", { name: "Delete account" }).at(-1)!;
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/To confirm, type/), " Account");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled, with Escape too", async () => {
    const onDelete = vi.fn();
    render(<DeleteAccountCard scenarioCount={2} onDelete={onDelete} />);
    await openAndType("delete my account");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows progress while deleting and locks the dialog", async () => {
    render(<DeleteAccountCard scenarioCount={2} onDelete={() => new Promise(() => {})} />);
    await openAndType("delete my account{Enter}");
    expect(screen.getByRole("button", { name: "Deleting account" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText(/To confirm, type/)).toBeDisabled();
  });

  it("explains a failure, offers support and a retry", async () => {
    const onDelete = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValue(undefined);
    render(<DeleteAccountCard scenarioCount={2} onDelete={onDelete} />);
    await openAndType("delete my account");
    await userEvent.click(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "support@rothconversionsoptimizer.com"
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onDelete).toHaveBeenCalledTimes(2);
  });

  it("offers a download first when there's something to keep", async () => {
    const onDownload = vi.fn();
    render(<DeleteAccountCard scenarioCount={3} onDelete={vi.fn()} onDownload={onDownload} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.click(screen.getByRole("button", { name: "Download your scenarios" }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
