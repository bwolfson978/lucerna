import type { SavedScenario } from "@/lib/types";
import { SITE_URL } from "@/lib/utils/constants";

const COLUMNS = [
  "Name",
  "Saved on",
  "Filing status",
  "Traditional IRA balance",
  "Years planned",
  "Estimated lifetime tax savings",
  "Link",
] as const;

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Saved scenarios as a CSV, one row each, with a link that reopens the scenario. */
export function scenariosToCsv(scenarios: SavedScenario[]): string {
  const rows = scenarios.map((s) => [
    s.name,
    s.updated_at.slice(0, 10),
    s.filing_status === "married_filing_jointly" ? "Married filing jointly" : "Single",
    Math.round(s.ira_balance),
    s.num_years,
    Math.round(s.estimated_savings),
    `${SITE_URL}/calculator?saved=${s.id}`,
  ]);
  return [COLUMNS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Starts a browser download of the scenarios CSV. */
export function downloadScenariosCsv(scenarios: SavedScenario[], filename = "my-scenarios.csv") {
  const blob = new Blob([scenariosToCsv(scenarios)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
