import { scenariosToCsv } from "../csv";

describe("scenariosToCsv", () => {
  it("writes a header and one row per scenario, quoting where needed", () => {
    const csv = scenariosToCsv([
      {
        id: "abc",
        name: 'Retire at 62, "Texas"',
        created_at: "2026-10-14T18:00:00Z",
        filing_status: "married_filing_jointly",
        num_years: 27,
        estimated_savings: 41234.6,
        ira_balance: 1500000,
      },
    ]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe(
      "Name,Saved on,Filing status,Traditional IRA balance,Years planned,Estimated lifetime tax savings,Link"
    );
    expect(row).toBe(
      '"Retire at 62, ""Texas""",2026-10-14,Married filing jointly,1500000,27,41235,https://www.rothconversionsoptimizer.com/calculator?saved=abc'
    );
  });
});
