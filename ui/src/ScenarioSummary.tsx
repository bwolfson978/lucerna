"use client";

import { useState } from "react";
import { cn } from "./cn";
import { formatCurrency } from "./format";
import { incomeSourceAges, incomeSourceLabel, type IncomeSource } from "./income";
import { FILING_STATUS_OPTIONS, STATE_OPTIONS, filingStatusLabel, stateName } from "./options";

export type FilingStatus = "single" | "married_filing_jointly";

/** Scenario values as recorded: the `scenario` from `prepare_scenario` (backend
 * app/tools/core.py scenario_from_draft), or the web app's draft. */
export interface ScenarioValues {
  age?: number | null;
  filing_status?: FilingStatus | null;
  state?: string | null;
  retirement_state?: string | null;
  custom_state_rate_pct?: number | null;
  current_income?: number | null;
  /** Last age current income is earned. Unset: the year before retirement, or for life. */
  current_income_end_age?: number | null;
  income_sources?: IncomeSource[];
  income_growth_rate_pct?: number | null;
  traditional_balance?: number | null;
  roth_balance?: number | null;
  retirement_age?: number | null;
  retirement_spending?: number | null;
  planning_horizon_age?: number | null;
  investment_return_pct?: number | null;
  discount_rate_pct?: number | null;
  /** Yearly inflation, percent. Every amount is in today's dollars. */
  inflation_pct?: number | null;
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
  /** State now and in retirement get a pair of selects. */
  editState?: boolean;
  /** Edits that need the full form (ACA, income sources, per-year income). */
  formOnly?: boolean;
}

/** Rows that hold defaults most people keep; they sit behind one "Assumptions" line. */
const ASSUMPTION_KEYS = new Set(["growth", "horizon", "return", "inflation"]);

/** Labels for the fields `prepare_scenario` reports as missing. */
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
    {
      key: "age",
      label: "Age",
      value: s.age != null ? String(s.age) : notSet,
      edit: "age",
    },
    {
      key: "filing",
      label: "Filing status",
      value: filingStatusLabel(s.filing_status) ?? notSet,
      editFiling: true,
    },
    {
      key: "income",
      label: "Income this year",
      value:
        s.current_income == null
          ? notSet
          : s.current_income_end_age != null
            ? `${formatCurrency(s.current_income)} until ${s.current_income_end_age}`
            : formatCurrency(s.current_income),
      edit: "current_income",
    },
    {
      key: "growth",
      label: "Income growth",
      value: `${s.income_growth_rate_pct ?? 0}% a year`,
      edit: "income_growth_rate_pct",
    },
    ...(s.income_sources ?? []).map((src, i) => ({
      key: `source-${i}`,
      label: incomeSourceLabel(src),
      value: `${formatCurrency(src.amount)} a year ${incomeSourceAges(src)}`,
      formOnly: true,
    })),
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
      label: "Household spending in retirement",
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
      editState: true,
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
    {
      key: "inflation",
      label: "Inflation",
      value: `${s.inflation_pct ?? 2.5}% a year`,
      edit: "inflation_pct",
    },
  ];
}

interface ScenarioSummaryProps {
  data: ScenarioSummaryData;
  /** Short status in the header, such as "Confirmed". */
  badge?: string;
  /** Edit a value inline. Omit for a read-only summary. */
  onEdit?: (patch: Partial<ScenarioValues>) => void;
  /** Open the full form, for values edited there (ACA). */
  onOpenForm?: () => void;
  /** Run the analysis. Omit to hide the footer. */
  onRun?: () => void;
  runDisabled?: boolean;
  /** Footer text next to the Run button. */
  hint?: string;
  /** Required values still missing (field names), listed above the footer. */
  missing?: string[];
  /** Start folded to a one-line recap that opens from the header, as for a summary
   * already run, further up a conversation. */
  collapsible?: boolean;
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
  collapsible = false,
}: ScenarioSummaryProps) {
  const rows = buildRows(data.scenario);
  const primary = rows.filter((row) => !ASSUMPTION_KEYS.has(row.key));
  const assumptions = rows.filter((row) => ASSUMPTION_KEYS.has(row.key));
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [collapsed, setCollapsed] = useState(collapsible);
  const timeline = data.timeline;
  const notedYears = timeline.filter((y) => y.note);
  const s = data.scenario;

  return (
    <article className="card overflow-hidden !p-0" data-ui="scenario-summary">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "border-border bg-paper-warm px-default sm:px-comfortable flex w-full items-center justify-between gap-3 py-3 text-left",
            !collapsed && "border-b"
          )}
        >
          <span className="eyebrow" data-ui="eyebrow">
            Your scenario
          </span>
          <span className="flex items-center gap-2">
            {badge && <span className="badge-positive">{badge}</span>}
            <Chevron open={!collapsed} />
          </span>
        </button>
      ) : (
        <div className="border-border bg-paper-warm px-default sm:px-comfortable flex items-center justify-between gap-3 border-b py-3">
          <span className="eyebrow" data-ui="eyebrow">
            Your scenario
          </span>
          {badge && <span className="badge-positive">{badge}</span>}
        </div>
      )}
      {collapsed ? (
        <p
          className="px-default sm:px-comfortable font-data text-body-sm text-text-secondary border-border border-t py-3"
          data-ui="scenario-recap"
        >
          {recap(s)}
        </p>
      ) : (
        <>
          {/* What the person told us: one column on phones, two from sm. Each row draws its
          own bottom rule; the list tucks the last one under the next section's top border. */}
          <dl className="-mb-px grid sm:grid-cols-2">
            {primary.map((row) => (
              <SummaryRow
                key={row.key}
                row={row}
                scenario={s}
                onEdit={onEdit}
                onOpenForm={onOpenForm}
                className="sm:odd:border-r"
              />
            ))}
          </dl>
          {/* Defaults most people keep, folded into one line until asked for. */}
          <div className="border-border border-t" data-ui="scenario-assumptions">
            <button
              type="button"
              aria-expanded={showAssumptions}
              onClick={() => setShowAssumptions((open) => !open)}
              className="px-default sm:px-comfortable hover:bg-paper flex min-h-[44px] w-full items-center justify-between gap-4 py-1 text-left"
            >
              <span className="text-body-sm text-text-secondary">Assumptions</span>
              <span className="font-data text-text-primary sm:text-body-sm flex items-center gap-2 text-right text-[13px]">
                {`${s.income_growth_rate_pct ?? 0}% growth · ${s.investment_return_pct ?? 7}% return · age ${s.planning_horizon_age ?? 90}`}
                <Chevron open={showAssumptions} />
              </span>
            </button>
            {showAssumptions && (
              <dl className="border-border -mb-px grid border-t sm:grid-cols-2">
                {assumptions.map((row) => (
                  <SummaryRow
                    key={row.key}
                    row={row}
                    scenario={s}
                    onEdit={onEdit}
                    onOpenForm={onOpenForm}
                    className="sm:odd:border-r"
                  />
                ))}
              </dl>
            )}
          </div>
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
        </>
      )}
    </article>
  );
}

/** The scenario in one line, for a folded summary. */
function recap(s: ScenarioValues): string {
  return [
    s.age != null && `Age ${s.age}`,
    filingStatusLabel(s.filing_status),
    s.current_income != null && `${formatCurrency(s.current_income)} income`,
    s.traditional_balance != null && `${formatCurrency(s.traditional_balance)} traditional`,
    s.retirement_age != null && `drawing at ${s.retirement_age}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={cn(
        "text-text-tertiary shrink-0 transition-transform duration-200",
        open && "rotate-180"
      )}
    >
      <path
        d="M3 4.5 6 7.5l3-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryRow({
  row,
  scenario,
  onEdit,
  onOpenForm,
  className,
}: {
  row: Row;
  scenario: ScenarioValues;
  onEdit?: (patch: Partial<ScenarioValues>) => void;
  onOpenForm?: () => void;
  /** Column divider for the grid the row sits in. */
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const canEdit =
    !!onEdit && (row.edit || row.editFiling || row.editState || (row.formOnly && onOpenForm));

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
    <div
      className={cn(
        "px-default sm:px-comfortable border-border flex min-h-[44px] items-center justify-between gap-4 border-b py-1",
        className,
        editing && row.editState && "bg-paper flex-wrap gap-y-2 pt-3 pb-3"
      )}
    >
      <dt className="text-body-sm text-text-secondary">{row.label}</dt>
      <dd className={cn("m-0", editing && row.editState ? "basis-full text-left" : "text-right")}>
        {editing && row.editState ? (
          <StateEditor scenario={scenario} onEdit={onEdit} onDone={() => setEditing(false)} />
        ) : editing && row.editFiling ? (
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

const FIELD_CLASS =
  "border-border text-body-sm text-text-primary focus:border-pine focus:ring-pine-mid/15 min-h-[44px] focus:ring-2 focus:outline-none w-full rounded-[10px] border bg-white px-2";

/** State now and in retirement, edited in place with the system's own select. */
function StateEditor({
  scenario,
  onEdit,
  onDone,
}: {
  scenario: ScenarioValues;
  onEdit?: (patch: Partial<ScenarioValues>) => void;
  onDone: () => void;
}) {
  const now = scenario.state ?? "none";
  const retirement = scenario.retirement_state ?? now;
  const [rate, setRate] = useState(
    scenario.custom_state_rate_pct != null ? String(scenario.custom_state_rate_pct) : ""
  );

  function changeNow(value: string) {
    const state = value === "none" ? null : value;
    // A retirement state that differs from today's stays put; otherwise it follows,
    // as it does in the form. Null retirement_state means "same as now".
    onEdit?.(retirement !== now ? { state, retirement_state: retirement } : { state });
  }

  function commitRate() {
    const parsed = rate.trim() === "" ? null : Number(rate.replace(/[%\s]/g, ""));
    if (parsed === null || Number.isFinite(parsed)) onEdit?.({ custom_state_rate_pct: parsed });
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-ui="state-editor"
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
    >
      <div className="grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-secondary">Now</span>
          <select
            autoFocus
            className={FIELD_CLASS}
            value={now}
            onChange={(e) => changeNow(e.target.value)}
          >
            {STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-secondary">In retirement</span>
          <select
            className={FIELD_CLASS}
            value={retirement}
            onChange={(e) =>
              onEdit?.({
                retirement_state: e.target.value === "none" ? null : e.target.value,
              })
            }
          >
            {STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {now === "custom" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-secondary">State tax rate (%)</span>
          <input
            inputMode="decimal"
            className={cn(FIELD_CLASS, "font-data")}
            value={rate}
            placeholder="e.g. 5"
            onChange={(e) => setRate(e.target.value)}
            onBlur={commitRate}
          />
        </label>
      )}
      <div className="-mr-2 flex justify-end">
        <button
          type="button"
          className="text-body-sm text-pine hover:bg-paper-deep min-h-[40px] rounded-full px-4 font-semibold"
          onClick={() => {
            if (now === "custom") commitRate();
            onDone();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
