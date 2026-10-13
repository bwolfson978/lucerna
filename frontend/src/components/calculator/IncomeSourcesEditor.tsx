"use client";

import { useState } from "react";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { NumericField } from "@/components/common/NumericField";
import { CURRENT_YEAR } from "@/lib/utils/constants";
import { formatCurrency } from "@/lib/utils/formatting";
import { sourceLabel, type IncomeKind, type IncomeSource } from "@/lib/utils/timeline";

/** Colors shared by the source dots and the income preview chart. */
export const SOURCE_COLORS: Record<IncomeKind | "base" | "accounts", string> = {
  base: "#cfc9ba",
  social_security: "#8a8472",
  pension: "#66a183",
  other: "#c9a443",
  accounts: "rgba(242, 101, 34, 0.35)",
};

const ADD_OPTIONS: { kind: IncomeKind; label: string }[] = [
  { kind: "social_security", label: "Social Security" },
  { kind: "pension", label: "Pension" },
  { kind: "other", label: "Other income" },
];

interface IncomeSourcesEditorProps {
  sources: IncomeSource[];
  onChange: (sources: IncomeSource[]) => void;
  /** The user's current age, to show the calendar year a source starts. */
  age: number | null;
  retirementAge: number | null;
  planningHorizonAge: number;
  /** Married couples can add a spouse's Social Security or pension. */
  married: boolean;
  errors?: Record<number, string>;
}

function defaultStartAge(kind: IncomeKind, age: number | null, retirementAge: number | null) {
  const now = age ?? 65;
  if (kind === "social_security") return Math.max(now, 67);
  if (kind === "pension") return Math.max(now, retirementAge ?? 65);
  return now;
}

function ageRange(src: IncomeSource): string {
  const end = src.end_age == null ? "plan end" : `age ${src.end_age}`;
  return `From age ${src.start_age} to ${end}`;
}

export function IncomeSourcesEditor({
  sources,
  onChange,
  age,
  retirementAge,
  planningHorizonAge,
  married,
  errors = {},
}: IncomeSourcesEditorProps) {
  const [editing, setEditing] = useState<number | null>(null);

  const update = (index: number, changes: Partial<IncomeSource>) =>
    onChange(sources.map((src, i) => (i === index ? { ...src, ...changes } : src)));

  const add = (kind: IncomeKind) => {
    const hasOwn = sources.some((s) => s.kind === kind && s.owner === "you");
    const owner = married && kind === "social_security" && hasOwn ? "spouse" : "you";
    onChange([
      ...sources,
      { kind, owner, amount: 0, start_age: defaultStartAge(kind, age, retirementAge) },
    ]);
    setEditing(sources.length);
  };

  const remove = (index: number) => {
    onChange(sources.filter((_, i) => i !== index));
    setEditing(null);
  };

  const yearAt = (sourceAge: number) => (age != null ? ` (${CURRENT_YEAR + sourceAge - age})` : "");

  return (
    <div className="flex flex-col gap-tight">
      {sources.map((src, index) => {
        const open = editing === index || errors[index] != null;
        const dot = (
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: SOURCE_COLORS[src.kind] }}
          />
        );
        if (!open) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => setEditing(index)}
              className="flex items-center gap-3 rounded border border-border bg-bg-elevated px-4 py-3 text-left transition-colors duration-300 hover:border-border-emphasis"
              aria-label={`Edit ${sourceLabel(src)}`}
            >
              {dot}
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium text-text-primary">
                  {sourceLabel(src)}
                </span>
                <span className="block text-body-sm text-text-secondary">{ageRange(src)}</span>
              </span>
              <span className="text-right">
                <span className="block text-body-sm font-semibold text-text-primary">
                  {formatCurrency(src.amount)}
                </span>
                <span className="block text-caption text-text-tertiary">a year</span>
              </span>
            </button>
          );
        }
        return (
          <div
            key={index}
            className="flex flex-col gap-default rounded border border-pine bg-bg-elevated px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {dot}
              <span className="flex-1 text-body font-medium text-text-primary">
                {sourceLabel(src)}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                className="text-body-sm text-text-tertiary transition-colors duration-300 hover:text-negative"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-body-sm font-semibold text-pine transition-colors duration-300 hover:text-pine-mid"
              >
                Done
              </button>
            </div>
            <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
              {src.kind === "other" ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-body-sm font-medium text-text-primary">Name</span>
                  <input
                    type="text"
                    value={src.label ?? ""}
                    maxLength={40}
                    placeholder="e.g. Rental income"
                    onChange={(e) => update(index, { label: e.target.value || null })}
                    className="min-h-[44px] rounded-sm border border-border bg-bg px-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
                  />
                </label>
              ) : married ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-body-sm font-medium text-text-primary">Whose</span>
                  <div className="grid grid-cols-2 overflow-hidden rounded-sm border border-border">
                    {(["you", "spouse"] as const).map((owner) => (
                      <button
                        key={owner}
                        type="button"
                        aria-pressed={src.owner === owner}
                        onClick={() => update(index, { owner })}
                        className={`min-h-[44px] text-body transition-colors duration-300 ${
                          src.owner === owner
                            ? "bg-ink text-paper"
                            : "bg-bg text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {owner === "you" ? "You" : "Spouse"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <CurrencyInput
                label="Yearly amount"
                value={src.amount || ""}
                placeholder="0"
                min={0}
                helper={
                  src.kind === "social_security"
                    ? "Monthly estimate × 12, from ssa.gov"
                    : "Before tax, per year"
                }
                onChange={(v) => update(index, { amount: v })}
              />
              <NumericField
                label="Starts at age"
                value={src.start_age}
                min={0}
                max={120}
                helper={`Your age that year${yearAt(src.start_age)}`}
                onChange={(v) => update(index, { start_age: v ?? 0 })}
              />
              <NumericField
                label="Ends at age"
                value={src.end_age ?? ""}
                placeholder={`Plan end (${planningHorizonAge})`}
                min={0}
                max={120}
                error={errors[index]}
                helper="Leave blank if it lasts for life"
                onChange={(v) => update(index, { end_age: v })}
              />
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        {ADD_OPTIONS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            onClick={() => add(kind)}
            className="min-h-[44px] rounded-full border border-dashed border-border-emphasis px-4 text-body-sm text-pine transition-colors duration-300 hover:border-pine hover:bg-accent-light"
          >
            + {label}
          </button>
        ))}
      </div>
    </div>
  );
}
