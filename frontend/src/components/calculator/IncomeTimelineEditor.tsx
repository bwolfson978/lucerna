"use client";

import { useCallback, useState } from "react";
import type { YearlyIncome } from "@/lib/types";
import { FormField } from "@/components/common/FormField";
import { CurrencyInput } from "@/components/common/CurrencyInput";
import { FormSelect } from "@/components/common/FormSelect";
import { ChevronDownIcon } from "@/components/common/icons";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CURRENT_YEAR } from "@/lib/utils/constants";
import { Card } from "@/components/ui/card";

interface IncomeTimelineEditorProps {
  timeline: YearlyIncome[];
  onChange: (timeline: YearlyIncome[]) => void;
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

export function IncomeTimelineEditor({
  timeline,
  onChange,
  onReset,
  description,
  defaultState,
}: IncomeTimelineEditorProps) {
  const addYear = useCallback(() => {
    if (timeline.length >= 15) return;
    const lastYear = timeline.length > 0 ? timeline[timeline.length - 1].year : CURRENT_YEAR - 1;
    onChange([...timeline, { year: lastYear + 1, gross_income: 0 }]);
  }, [timeline, onChange]);

  const removeYear = useCallback(
    (index: number) => {
      if (timeline.length <= 1) return;
      onChange(timeline.filter((_, i) => i !== index));
    },
    [timeline, onChange]
  );

  const updateYear = useCallback(
    (index: number, field: keyof YearlyIncome, value: unknown) => {
      const updated = timeline.map((row, i) => {
        if (i !== index) return row;
        return { ...row, [field]: value };
      });
      onChange(updated);
    },
    [timeline, onChange]
  );

  const [open, setOpen] = useState(false);

  const yearRange =
    timeline.length > 0 ? `${timeline[0].year}–${timeline[timeline.length - 1].year}` : "";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-default">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 text-h3 text-text-primary transition-colors duration-300 hover:text-accent"
          >
            <ChevronDownIcon
              className={`text-text-tertiary transition-transform duration-300 ${open ? "rotate-0" : "-rotate-90"}`}
            />
            Income timeline
            {!open && (
              <span className="ml-1 text-body-sm font-normal text-text-tertiary">
                {yearRange} · {timeline.length} yrs ·{" "}
                <span className="text-accent/70">click to edit</span>
              </span>
            )}
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-body-sm text-text-tertiary transition-colors duration-300 hover:text-text-secondary"
            >
              Reset
            </button>
          )}
          <Button
            variant="outline"
            onClick={addYear}
            disabled={timeline.length >= 15}
            className="text-body-sm"
          >
            + Add year
          </Button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-default">
          <p className="text-body-sm text-text-secondary">
            {description ??
              "Enter your expected income for each year. The optimizer finds the best conversion schedule across all years."}
          </p>

          <div className="flex flex-col gap-tight">
            {timeline.map((row, index) => (
              <Card key={row.year} className="relative flex flex-col gap-tight">
                {/* Remove button — top-right on mobile, inline on desktop */}
                {timeline.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeYear(index)}
                    className="absolute right-2 top-2 p-1 text-text-tertiary transition-colors duration-300 hover:text-negative sm:hidden"
                    aria-label={`Remove year ${row.year}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}

                {/* Fields — stacked rows on mobile, single row on desktop */}
                <div className="grid grid-cols-[4rem_1fr] gap-tight sm:flex sm:items-end sm:gap-tight">
                  <div className="shrink-0">
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

                  <div className="min-w-0 flex-1 pr-6 sm:pr-0">
                    <CurrencyInput
                      label="Gross income"
                      value={row.gross_income || ""}
                      placeholder="0"
                      onChange={(val) => updateYear(index, "gross_income", val)}
                    />
                  </div>

                  {defaultState && (
                    <div className="sm:w-24 sm:shrink-0">
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

                  {/* Desktop-only inline remove button */}
                  {timeline.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeYear(index)}
                      className="hidden min-h-[44px] items-center p-2 text-text-tertiary transition-colors duration-300 hover:text-negative sm:flex"
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

                {/* Notes */}
                <input
                  type="text"
                  value={row.notes ?? ""}
                  placeholder="Notes (e.g. sabbatical, startup, part-time)"
                  onChange={(e) => updateYear(index, "notes", e.target.value)}
                  className="w-full rounded-md border border-border/50 bg-transparent px-3 py-1.5 text-body-sm text-text-secondary transition-colors duration-300 placeholder:text-text-tertiary/50 focus:border-accent/50 focus:outline-none"
                />
              </Card>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
