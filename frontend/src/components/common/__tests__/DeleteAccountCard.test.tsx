import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountCard } from "../DeleteAccountCard";

describe("DeleteAccountCard", () => {
  it("only deletes after the second, explicit confirmation", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<DeleteAccountCard onDelete={onDelete} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Yes, delete my account" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled", async () => {
    const onDelete = vi.fn();
    render(<DeleteAccountCard onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("explains a failure and offers support", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("nope"));
    render(<DeleteAccountCard onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete my account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't delete your account");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
