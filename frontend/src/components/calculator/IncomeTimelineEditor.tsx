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

const STATE_YEAR_OPTIONS = buildStateYearOptions();

const lifeEventOptions = Object.entries(LIFE_EVENT_LABELS).map(
  ([value, label]) => ({ value, label })
);

export function IncomeTimelineEditor({
  timeline,
  onChange,
  onReset,
  description,
  defaultState,
}: IncomeTimelineEditorProps) {
  const addYear = useCallback(() => {
    if (timeline.length >= 15) return;
    const lastYear =
      timeline.length > 0
        ? timeline[timeline.length - 1].year
        : CURRENT_YEAR - 1;
    onChange([
      ...timeline,
      { year: lastYear + 1, gross_income: 0, life_event: "none" },
    ]);
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

  const maxIncome = Math.max(...timeline.map((y) => y.gross_income), 1);
  const [open, setOpen] = useState(false);

  const yearRange = timeline.length > 0
    ? `${timeline[0].year}–${timeline[timeline.length - 1].year}`
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
            Income timeline
            {!open && (
              <span className="text-body-sm text-text-tertiary font-normal ml-1">
                {yearRange} · {timeline.length} yrs · <span className="text-accent/70">click to edit</span>
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
            {description ?? "Enter your expected income for each year. The optimizer finds the best conversion schedule across all years."}
          </p>

          <div className="flex flex-col gap-tight">
        {timeline.map((row, index) => (
          <Card
            key={row.year}
            className="relative flex flex-col gap-tight"
          >
            {/* Remove button — top-right on mobile, inline on desktop */}
            {timeline.length > 1 && (
              <button
                type="button"
                onClick={() => removeYear(index)}
                className="absolute top-2 right-2 sm:hidden text-text-tertiary hover:text-negative transition-colors duration-300 p-1"
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

              <div className="flex-1 min-w-0 pr-6 sm:pr-0">
                <CurrencyInput
                  label="Gross income"
                  value={row.gross_income || ""}
                  placeholder="0"
                  onChange={(val) => updateYear(index, "gross_income", val)}
                />
              </div>

              <div className="sm:w-36 sm:shrink-0">
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
                  className="hidden sm:flex text-text-tertiary hover:text-negative transition-colors duration-300 p-2 min-h-[44px] items-center"
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
            <div className="h-6 flex items-center gap-2">
              <div
                className="h-4 bg-neutral/20 rounded-sm relative overflow-hidden flex-1"
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
