"use client";

import { useCallback, useState } from "react";
import type { YearlyIncome, LifeEvent } from "@/lib/types";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { FormSelect } from "@/components/common/FormSelect";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { LIFE_EVENT_LABELS, CURRENT_YEAR } from "@/lib/utils/constants";
import { formatCurrency } from "@/lib/utils/formatting";
import { Card } from "@/components/ui/card";

interface IncomeTrajectoryEditorProps {
  trajectory: YearlyIncome[];
  onChange: (trajectory: YearlyIncome[]) => void;
  onReset?: () => void;
  description?: string;
  defaultState?: string;
}

const buildStateYearOptions = (defaultState?: string) => [
  { value: "default", label: defaultState && defaultState !== "none" ? defaultState : "Default" },
  { value: "AL", label: "AL" },
  { value: "AZ", label: "AZ" },
  { value: "AR", label: "AR" },
  { value: "CA", label: "CA" },
  { value: "CO", label: "CO" },
  { value: "CT", label: "CT" },
  { value: "DE", label: "DE" },
  { value: "DC", label: "DC" },
  { value: "GA", label: "GA" },
  { value: "HI", label: "HI" },
  { value: "ID", label: "ID" },
  { value: "IL", label: "IL" },
  { value: "IN", label: "IN" },
  { value: "IA", label: "IA" },
  { value: "KS", label: "KS" },
  { value: "KY", label: "KY" },
  { value: "LA", label: "LA" },
  { value: "ME", label: "ME" },
  { value: "MD", label: "MD" },
  { value: "MA", label: "MA" },
  { value: "MI", label: "MI" },
  { value: "MN", label: "MN" },
  { value: "MS", label: "MS" },
  { value: "MO", label: "MO" },
  { value: "MT", label: "MT" },
  { value: "NE", label: "NE" },
  { value: "NJ", label: "NJ" },
  { value: "NM", label: "NM" },
  { value: "NY", label: "NY" },
  { value: "NC", label: "NC" },
  { value: "ND", label: "ND" },
  { value: "OH", label: "OH" },
  { value: "OK", label: "OK" },
  { value: "OR", label: "OR" },
  { value: "PA", label: "PA" },
  { value: "RI", label: "RI" },
  { value: "SC", label: "SC" },
  { value: "UT", label: "UT" },
  { value: "VT", label: "VT" },
  { value: "VA", label: "VA" },
  { value: "WV", label: "WV" },
  { value: "WI", label: "WI" },
  { value: "custom", label: "Other" },
  { value: "none", label: "No tax" },
];

const STATE_YEAR_OPTIONS = buildStateYearOptions();

const lifeEventOptions = Object.entries(LIFE_EVENT_LABELS).map(
  ([value, label]) => ({ value, label })
);

export function IncomeTrajectoryEditor({
  trajectory,
  onChange,
  onReset,
  description,
  defaultState,
}: IncomeTrajectoryEditorProps) {
  const addYear = useCallback(() => {
    if (trajectory.length >= 15) return;
    const lastYear =
      trajectory.length > 0
        ? trajectory[trajectory.length - 1].year
        : CURRENT_YEAR - 1;
    onChange([
      ...trajectory,
      { year: lastYear + 1, gross_income: 0, life_event: "none" },
    ]);
  }, [trajectory, onChange]);

  const removeYear = useCallback(
    (index: number) => {
      if (trajectory.length <= 1) return;
      onChange(trajectory.filter((_, i) => i !== index));
    },
    [trajectory, onChange]
  );

  const updateYear = useCallback(
    (index: number, field: keyof YearlyIncome, value: unknown) => {
      const updated = trajectory.map((row, i) => {
        if (i !== index) return row;
        return { ...row, [field]: value };
      });
      onChange(updated);
    },
    [trajectory, onChange]
  );

  const maxIncome = Math.max(...trajectory.map((y) => y.gross_income), 1);
  const [open, setOpen] = useState(false);

  const yearRange = trajectory.length > 0
    ? `${trajectory[0].year}–${trajectory[trajectory.length - 1].year}`
    : "";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-default">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-h3 text-text-primary hover:text-accent transition-colors duration-300"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className={`text-text-tertiary transition-transform duration-300 ${open ? "rotate-0" : "-rotate-90"}`}
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Income trajectory
            {!open && (
              <span className="text-body-sm text-text-tertiary font-normal ml-1">
                {yearRange} · {trajectory.length} yrs · <span className="text-accent/70">click to edit</span>
              </span>
            )}
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-body-sm text-text-tertiary hover:text-text-secondary transition-colors duration-300"
            >
              Reset to defaults
            </button>
          )}
          <Button
            variant="outline"
            onClick={addYear}
            disabled={trajectory.length >= 15}
            className="text-body-sm"
          >
            + Add year
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-default">
          <p className="text-body-sm text-text-secondary">
            {description ?? "Enter your expected income for each year. The optimizer finds the best conversion schedule across all years."}
          </p>

          <div className="flex flex-col gap-tight">
        {trajectory.map((row, index) => (
          <Card
            key={row.year}
            className="flex flex-col gap-tight sm:flex-row sm:items-end"
          >
            <div className="flex items-end gap-tight flex-1">
              <div className="w-16 shrink-0">
                <FormField
                  label="Year"
                  type="number"
                  value={row.year}
                  numeric
                  onChange={(e) =>
                    updateYear(index, "year", parseInt(e.target.value) || CURRENT_YEAR)
                  }
                />
              </div>

              <div className="flex-1 min-w-0">
                <CurrencyInput
                  label="Gross income"
                  value={row.gross_income || ""}
                  placeholder="0"
                  onChange={(val) => updateYear(index, "gross_income", val)}
                />
              </div>

              <div className="w-36 shrink-0">
                <FormSelect
                  label="Life event"
                  value={row.life_event}
                  options={lifeEventOptions}
                  onChange={(e) =>
                    updateYear(
                      index,
                      "life_event",
                      e.target.value as LifeEvent
                    )
                  }
                />
              </div>

              {defaultState && (
                <div className="w-24 shrink-0">
                  <FormSelect
                    label="State"
                    value={row.state ?? "default"}
                    options={buildStateYearOptions(defaultState)}
                    onChange={(e) =>
                      updateYear(
                        index,
                        "state",
                        e.target.value === "default" ? null : e.target.value
                      )
                    }
                  />
                </div>
              )}

              {trajectory.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeYear(index)}
                  className="text-text-tertiary hover:text-negative transition-colors duration-300 p-2 min-h-[44px] flex items-center"
                  aria-label={`Remove year ${row.year}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Income bar preview */}
            <div className="sm:w-32 h-6 flex items-center gap-2">
              <div
                className="h-4 bg-neutral/20 rounded-sm relative overflow-hidden"
                style={{ width: "100%" }}
              >
                <div
                  className="h-full bg-neutral rounded-sm transition-all duration-300"
                  style={{
                    width: `${(row.gross_income / maxIncome) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[11px] font-mono text-text-tertiary whitespace-nowrap">
                {formatCurrency(row.gross_income)}
              </span>
            </div>
          </Card>
        ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
