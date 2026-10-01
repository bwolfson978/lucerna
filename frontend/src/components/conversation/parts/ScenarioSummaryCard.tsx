"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/formatting";
import { FILING_STATUS_OPTIONS, STATE_OPTIONS } from "@/lib/utils/formOptions";
import { isDraftReady, type DraftPatch, type ScenarioDraft } from "@/lib/scenario/draft";
import { useConversationContext } from "../ConversationContext";

type NumericKey =
  | "age"
  | "current_income"
  | "income_growth_rate_pct"
  | "traditional_balance"
  | "roth_balance"
  | "retirement_age"
  | "retirement_spending"
  | "planning_horizon_age"
  | "investment_return_pct"
  | "discount_rate_pct";

interface Row {
  key: string;
  label: string;
  value: string;
  /** Numeric field the row edits inline. */
  edit?: { field: NumericKey; kind: "money" | "number" | "percent" };
  /** Filing status gets a select. */
  editFiling?: boolean;
  /** Edits that need the form (states, ACA, per-year income). */
  formOnly?: boolean;
}

function stateLabel(code: string | null): string {
  if (!code) return "Federal only";
  const option = STATE_OPTIONS.find((o) => o.value === code);
  return option ? option.label.replace(/\s*\(.*\)$/, "") : code;
}

function buildRows(draft: ScenarioDraft): Row[] {
  const rows: Row[] = [
    {
      key: "age",
      label: "Age",
      value: draft.age != null ? String(draft.age) : "Not set",
      edit: { field: "age", kind: "number" },
    },
    {
      key: "filing",
      label: "Filing status",
      value: FILING_STATUS_OPTIONS.find((o) => o.value === draft.filing_status)?.label ?? "Not set",
      editFiling: true,
    },
    {
      key: "income",
      label: "Income this year",
      value: draft.current_income != null ? formatCurrency(draft.current_income) : "Not set",
      edit: { field: "current_income", kind: "money" },
    },
    {
      key: "growth",
      label: "Income growth",
      value: `${draft.income_growth_rate_pct ?? 0}% a year`,
      edit: { field: "income_growth_rate_pct", kind: "percent" },
    },
    {
      key: "traditional",
      label: "Traditional IRA/401(k)",
      value:
        draft.traditional_balance != null ? formatCurrency(draft.traditional_balance) : "Not set",
      edit: { field: "traditional_balance", kind: "money" },
    },
    {
      key: "roth",
      label: "Roth IRA/401(k)",
      value: formatCurrency(draft.roth_balance ?? 0),
      edit: { field: "roth_balance", kind: "money" },
    },
    {
      key: "retirement",
      label: "Start drawing at age",
      value: draft.retirement_age != null ? String(draft.retirement_age) : "Not set",
      edit: { field: "retirement_age", kind: "number" },
    },
    {
      key: "spending",
      label: "Retirement spending",
      value: draft.retirement_spending
        ? `${formatCurrency(draft.retirement_spending)} a year`
        : "4% rule",
      edit: { field: "retirement_spending", kind: "money" },
    },
    {
      key: "state",
      label: "State",
      value:
        draft.retirement_state && draft.retirement_state !== draft.state
          ? `${stateLabel(draft.state)}, then ${stateLabel(draft.retirement_state)}`
          : stateLabel(draft.state),
      formOnly: true,
    },
  ];
  if (draft.include_aca) {
    rows.push({
      key: "aca",
      label: "ACA marketplace",
      value: `${draft.household_size ?? 1} ${(draft.household_size ?? 1) === 1 ? "person" : "people"}, ${formatCurrency(draft.monthly_slcsp_premium ?? 620)}/mo benchmark`,
      formOnly: true,
    });
  }
  rows.push(
    {
      key: "horizon",
      label: "Plan through age",
      value: String(draft.planning_horizon_age ?? 90),
      edit: { field: "planning_horizon_age", kind: "number" },
    },
    {
      key: "return",
      label: "Investment return",
      value: `${draft.investment_return_pct ?? 7}%`,
      edit: { field: "investment_return_pct", kind: "percent" },
    }
  );
  return rows;
}

interface ScenarioSummaryCardProps {
  /** Values as they were when the assistant showed the card. */
  snapshot: ScenarioDraft;
  /** Latest summary not yet run: live values, editable, with the Run button. */
  active: boolean;
}

export function ScenarioSummaryCard({ snapshot, active }: ScenarioSummaryCardProps) {
  const { draft: liveDraft, editDraft, send, streaming, openForm } = useConversationContext();
  const draft = active ? liveDraft : snapshot;
  const rows = buildRows(draft);
  const notedYears = draft.timeline.filter((y) => y.notes);
  const ready = isDraftReady(draft);

  return (
    <div className="card overflow-hidden !p-0" data-testid="scenario-summary">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-paper-warm px-default py-3 sm:px-comfortable">
        <span className="eyebrow">Your scenario</span>
        {!active && <span className="badge-positive">Confirmed</span>}
      </div>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <SummaryRow
            key={row.key}
            row={row}
            draft={draft}
            editable={active && !streaming}
            onEdit={editDraft}
            onOpenForm={openForm}
          />
        ))}
      </dl>
      {draft.timeline.length > 0 && (
        <div className="border-t border-border px-default py-3 text-body-sm text-text-secondary sm:px-comfortable">
          <span className="text-text-primary">
            {draft.timeline.length}-year income timeline, {draft.timeline[0].year} to{" "}
            {draft.timeline[draft.timeline.length - 1].year}.
          </span>
          {notedYears.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {notedYears.map((y) => (
                <li key={y.year} className="font-data">
                  <span className="font-mono text-[12px] text-text-tertiary">{y.year}</span>{" "}
                  {formatCurrency(y.gross_income)}{" "}
                  <span className="text-text-tertiary">· {y.notes}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {active && (
        <div className="flex flex-col gap-2 border-t border-border px-default py-default sm:flex-row sm:items-center sm:justify-between sm:px-comfortable">
          <p className="text-caption text-text-tertiary">
            Tap a value to change it. Nothing runs until you say so.
          </p>
          <button
            type="button"
            className="btn-dark"
            disabled={streaming || !ready}
            onClick={() => {
              posthog.capture("scenario_confirmed");
              send("Looks right. Run the numbers.");
            }}
          >
            Run the numbers
          </button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({
  row,
  draft,
  editable,
  onEdit,
  onOpenForm,
}: {
  row: Row;
  draft: ScenarioDraft;
  editable: boolean;
  onEdit: (patch: DraftPatch) => void;
  onOpenForm?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const canEdit = editable && (row.edit || row.editFiling || (row.formOnly && onOpenForm));

  function startEdit() {
    if (!canEdit) return;
    if (row.formOnly) {
      onOpenForm?.();
      return;
    }
    if (row.edit) {
      const current = draft[row.edit.field];
      setValue(current != null ? String(current) : "");
    }
    setEditing(true);
  }

  function commit() {
    if (row.edit) {
      const parsed = value.trim() === "" ? null : Number(value.replace(/[$,%\s]/g, ""));
      if (parsed === null || Number.isFinite(parsed)) {
        onEdit({ [row.edit.field]: parsed } as DraftPatch);
      }
    }
    setEditing(false);
  }

  return (
    <div className="flex min-h-[44px] items-center justify-between gap-4 px-default py-2 sm:px-comfortable">
      <dt className="text-body-sm text-text-secondary">{row.label}</dt>
      <dd className="text-right">
        {editing && row.editFiling ? (
          <select
            autoFocus
            aria-label={row.label}
            className="min-h-[40px] rounded-[10px] border border-border bg-white px-2 text-body-sm"
            defaultValue={draft.filing_status ?? ""}
            onChange={(e) => {
              onEdit({ filing_status: e.target.value as ScenarioDraft["filing_status"] });
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
              className="font-data min-h-[40px] w-28 rounded-[10px] border border-pine bg-white px-2 text-right text-body-sm outline-none ring-2 ring-pine-mid/15"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={!canEdit}
            className={cn(
              "font-data min-h-[36px] rounded-md px-2 text-body-sm text-text-primary",
              canEdit &&
                "underline decoration-border decoration-dotted underline-offset-4 hover:bg-paper-deep hover:decoration-pine",
              !canEdit && "cursor-default"
            )}
          >
            {row.value}
          </button>
        )}
      </dd>
    </div>
  );
}
