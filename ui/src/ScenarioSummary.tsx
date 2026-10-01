"use client";

import { useState } from "react";
import { cn } from "./cn";
import { formatCurrency } from "./format";
import { FILING_STATUS_OPTIONS, filingStatusLabel, stateName } from "./options";

export type FilingStatus = "single" | "married_filing_jointly";

/** Scenario values as recorded: the `scenario` from `record_scenario` (backend
 * app/tools/core.py scenario_from_draft), or the web app's draft. */
export interface ScenarioValues {
  age?: number | null;
  filing_status?: FilingStatus | null;
  state?: string | null;
  retirement_state?: string | null;
  current_income?: number | null;
  income_growth_rate_pct?: number | null;
  traditional_balance?: number | null;
  roth_balance?: number | null;
  retirement_age?: number | null;
  retirement_spending?: number | null;
  planning_horizon_age?: number | null;
  investment_return_pct?: number | null;
  discount_rate_pct?: number | null;
  include_aca?: boolean;
  household_size?: number | null;
  monthly_slcsp_premium?: number | null;
}

export interface ScenarioSummaryData {
  scenario: ScenarioValues;
  /** Projected income by year; `note` marks a year the user described. */
  timeline: { year: number; gross_income: number; note?: string | null }[];
}

export function isScenarioSummaryData(value: unknown): value is ScenarioSummaryData {
  const v = value as ScenarioSummaryData | undefined;
  return !!v && typeof v.scenario === "object" && v.scenario !== null && Array.isArray(v.timeline);
}

type NumericKey = {
  [K in keyof ScenarioValues]-?: NonNullable<ScenarioValues[K]> extends number ? K : never;
}[keyof ScenarioValues];

interface Row {
  key: string;
  label: string;
  value: string;
  /** Numeric field the row edits inline. */
  edit?: NumericKey;
  /** Filing status gets a select. */
  editFiling?: boolean;
  /** Edits that need the full form (states, ACA, per-year income). */
  formOnly?: boolean;
}

/** Labels for the fields `record_scenario` reports as missing. */
export const FIELD_LABELS: Record<string, string> = {
  age: "Age",
  filing_status: "Filing status",
  current_income: "Income this year",
  traditional_balance: "Traditional IRA/401(k) balance",
  retirement_age: "Age you start drawing",
};

function buildRows(s: ScenarioValues): Row[] {
  const notSet = "Not set";
  const household = s.household_size ?? 1;
  return [
    { key: "age", label: "Age", value: s.age != null ? String(s.age) : notSet, edit: "age" },
    {
      key: "filing",
      label: "Filing status",
      value: filingStatusLabel(s.filing_status) ?? notSet,
      editFiling: true,
    },
    {
      key: "income",
      label: "Income this year",
      value: s.current_income != null ? formatCurrency(s.current_income) : notSet,
      edit: "current_income",
    },
    {
      key: "growth",
      label: "Income growth",
      value: `${s.income_growth_rate_pct ?? 0}% a year`,
      edit: "income_growth_rate_pct",
    },
    {
      key: "traditional",
      label: "Traditional IRA/401(k)",
      value: s.traditional_balance != null ? formatCurrency(s.traditional_balance) : notSet,
      edit: "traditional_balance",
    },
    {
      key: "roth",
      label: "Roth IRA/401(k)",
      value: formatCurrency(s.roth_balance ?? 0),
      edit: "roth_balance",
    },
    {
      key: "retirement",
      label: "Start drawing at age",
      value: s.retirement_age != null ? String(s.retirement_age) : notSet,
      edit: "retirement_age",
    },
    {
      key: "spending",
      label: "Retirement spending",
      value: s.retirement_spending ? `${formatCurrency(s.retirement_spending)} a year` : "4% rule",
      edit: "retirement_spending",
    },
    {
      key: "state",
      label: "State",
      value:
        s.retirement_state && s.retirement_state !== s.state
          ? `${stateName(s.state)}, then ${stateName(s.retirement_state)}`
          : stateName(s.state),
      formOnly: true,
    },
    ...(s.include_aca
      ? [
          {
            key: "aca",
            label: "ACA marketplace",
            value: `${household} ${household === 1 ? "person" : "people"}, ${formatCurrency(s.monthly_slcsp_premium ?? 620)}/mo benchmark`,
            formOnly: true,
          },
        ]
      : []),
    {
      key: "horizon",
      label: "Plan through age",
      value: String(s.planning_horizon_age ?? 90),
      edit: "planning_horizon_age",
    },
    {
      key: "return",
      label: "Investment return",
      value: `${s.investment_return_pct ?? 7}%`,
      edit: "investment_return_pct",
    },
  ];
}

interface ScenarioSummaryProps {
  data: ScenarioSummaryData;
  /** Short status in the header, such as "Confirmed". */
  badge?: string;
  /** Edit a value inline. Omit for a read-only summary. */
  onEdit?: (patch: Partial<ScenarioValues>) => void;
  /** Open the full form, for values edited there (states, ACA). */
  onOpenForm?: () => void;
  /** Run the analysis. Omit to hide the footer. */
  onRun?: () => void;
  runDisabled?: boolean;
  /** Footer text next to the Run button. */
  hint?: string;
  /** Required values still missing (field names), listed above the footer. */
  missing?: string[];
}

/** The scenario's values for the user to check before running the numbers. */
export function ScenarioSummary({
  data,
  badge,
  onEdit,
  onOpenForm,
  onRun,
  runDisabled = false,
  hint,
  missing = [],
}: ScenarioSummaryProps) {
  const rows = buildRows(data.scenario);
  const timeline = data.timeline;
  const notedYears = timeline.filter((y) => y.note);

  return (
    <article className="card overflow-hidden !p-0" data-ui="scenario-summary">
      <div className="border-border bg-paper-warm px-default sm:px-comfortable flex items-center justify-between gap-3 border-b py-3">
        <span className="eyebrow" data-ui="eyebrow">
          Your scenario
        </span>
        {badge && <span className="badge-positive">{badge}</span>}
      </div>
      <dl className="divide-border divide-y">
        {rows.map((row) => (
          <SummaryRow
            key={row.key}
            row={row}
            scenario={data.scenario}
            onEdit={onEdit}
            onOpenForm={onOpenForm}
          />
        ))}
      </dl>
      {timeline.length > 0 && (
        <div className="border-border px-default text-body-sm text-text-secondary sm:px-comfortable border-t py-3">
          <span className="text-text-primary">
            {timeline.length}-year income timeline, {timeline[0].year} to{" "}
            {timeline[timeline.length - 1].year}.
          </span>
          {notedYears.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {notedYears.map((y) => (
                <li key={y.year} className="font-data">
                  <span className="text-text-tertiary font-mono text-[12px]">{y.year}</span>{" "}
                  {formatCurrency(y.gross_income)}{" "}
                  <span className="text-text-tertiary">· {y.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {missing.length > 0 && (
        <div
          className="border-border px-default text-body-sm text-text-secondary sm:px-comfortable border-t py-3"
          data-ui="scenario-missing"
        >
          Still needed: {missing.map((m) => (FIELD_LABELS[m] ?? m).toLowerCase()).join(", ")}.
        </div>
      )}
      {onRun && (
        <div className="border-border px-default py-default sm:px-comfortable flex flex-col gap-2 border-t sm:flex-row sm:items-center sm:justify-between">
          {hint && <p className="text-caption text-text-tertiary">{hint}</p>}
          <button
            type="button"
            className="btn-dark"
            disabled={runDisabled}
            onClick={onRun}
            data-ui="cta"
          >
            Run the numbers
          </button>
        </div>
      )}
    </article>
  );
}

function SummaryRow({
  row,
  scenario,
  onEdit,
  onOpenForm,
}: {
  row: Row;
  scenario: ScenarioValues;
  onEdit?: (patch: Partial<ScenarioValues>) => void;
  onOpenForm?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const canEdit = !!onEdit && (row.edit || row.editFiling || (row.formOnly && onOpenForm));

  function startEdit() {
    if (!canEdit) return;
    if (row.formOnly) {
      onOpenForm?.();
      return;
    }
    if (row.edit) {
      const current = scenario[row.edit];
      setValue(current != null ? String(current) : "");
    }
    setEditing(true);
  }

  function commit() {
    if (row.edit) {
      const parsed = value.trim() === "" ? null : Number(value.replace(/[$,%\s]/g, ""));
      if (parsed === null || Number.isFinite(parsed)) onEdit?.({ [row.edit]: parsed });
    }
    setEditing(false);
  }

  return (
    <div className="px-default sm:px-comfortable flex min-h-[44px] items-center justify-between gap-4 py-2">
      <dt className="text-body-sm text-text-secondary">{row.label}</dt>
      <dd className="m-0 text-right">
        {editing && row.editFiling ? (
          <select
            autoFocus
            aria-label={row.label}
            className="border-border text-body-sm min-h-[40px] rounded-[10px] border bg-white px-2"
            defaultValue={scenario.filing_status ?? ""}
            onChange={(e) => {
              onEdit?.({ filing_status: e.target.value as FilingStatus });
              setEditing(false);
            }}
            onBlur={() => setEditing(false)}
          >
            {FILING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : editing && row.edit ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input
              autoFocus
              inputMode="decimal"
              aria-label={row.label}
              className="font-data border-pine text-body-sm ring-pine-mid/15 min-h-[40px] w-28 rounded-[10px] border bg-white px-2 text-right ring-2 outline-none"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
            />
          </form>
        ) : canEdit ? (
          <button
            type="button"
            onClick={startEdit}
            className="font-data text-body-sm text-text-primary decoration-border hover:bg-paper-deep hover:decoration-pine min-h-[36px] rounded-md px-2 underline decoration-dotted underline-offset-4"
          >
            {row.value}
          </button>
        ) : (
          <span className={cn("font-data text-body-sm text-text-primary inline-block px-2")}>
            {row.value}
          </span>
        )}
      </dd>
    </div>
  );
}
