import { describe, expect, it } from "vitest";
import { taxSourceNote } from "../taxSource";

const year = (
  conversion: number,
  tax: number,
  tax_from?: "income" | "accounts"
): Parameters<typeof taxSourceNote>[0][number] => ({
  year: 2026,
  age: 60,
  income: 0,
  rmd: 0,
  conversion,
  tax,
  tax_from,
});

describe("taxSourceNote", () => {
  it("says income pays while working", () => {
    expect(taxSourceNote([year(40_000, 4_800, "income"), year(0, 0, "accounts")])).toBe(
      "The tax comes out of your income in the years you convert, so everything you convert stays invested."
    );
  });

  it("says the accounts pay once they fund spending", () => {
    expect(taxSourceNote([year(0, 0, "income"), year(60_000, 7_200, "accounts")])).toBe(
      "Your account withdrawals pay the tax, on top of your spending."
    );
  });

  it("splits the tax when both kinds of year convert", () => {
    expect(
      taxSourceNote([
        year(40_000, 4_800, "income"),
        year(20_000, 2_400, "income"),
        year(60_000, 7_200, "accounts"),
      ])
    ).toBe(
      "$7,200 of the tax comes out of your income before you start drawing on your accounts. Your account withdrawals pay the rest, on top of your spending."
    );
  });

  it("says nothing when nothing is converted", () => {
    expect(taxSourceNote([year(0, 0, "income"), year(0, 0, "accounts")])).toBeNull();
  });

  it("says nothing for a result saved before the engine recorded it", () => {
    expect(taxSourceNote([year(40_000, 4_800), year(60_000, 7_200)])).toBeNull();
  });
});
