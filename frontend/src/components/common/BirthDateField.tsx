"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, i) => ({ value: String(i + 1), label }));

interface BirthDateFieldProps {
  label: string;
  /** 1 (January) to 12. */
  month: number | null;
  year: number | null;
  onChange: (value: { month: number | null; year: number | null }) => void;
  /** Shown under the field, e.g. the age this makes the person this year. */
  helper?: string;
  error?: string;
  tooltip?: string;
  required?: boolean;
  id?: string;
}

/** Month and year of birth: a month picker and a four-digit year, under one label. */
const BirthDateField = React.forwardRef<HTMLButtonElement, BirthDateFieldProps>(
  ({ label, month, year, onChange, helper, error, tooltip, required, id }, ref) => {
    const baseId = id || label.toLowerCase().replace(/\s+/g, "-");
    // The year is typed; keep what's typed until it's a whole year.
    const [yearText, setYearText] = React.useState(year != null ? String(year) : "");
    React.useEffect(() => {
      setYearText((text) => (Number(text) === year ? text : year != null ? String(year) : ""));
    }, [year]);

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <Label id={`${baseId}-label`} htmlFor={`${baseId}-month`}>
            {label}
          </Label>
          {required && (
            <span aria-hidden="true" className="-ml-0.5 text-negative" data-required-indicator>
              *
            </span>
          )}
          {tooltip && <Tooltip content={tooltip} />}
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-2">
          <Select
            ref={ref}
            id={`${baseId}-month`}
            options={MONTH_OPTIONS}
            value={month != null ? String(month) : undefined}
            placeholder="Month"
            aria-required={required}
            aria-invalid={(!!error && month == null) || undefined}
            className={cn(error && month == null && "border-negative")}
            onChange={(e) => onChange({ month: Number(e.target.value), year })}
          />
          <Input
            id={`${baseId}-year`}
            aria-label={`${label}: year`}
            aria-required={required || undefined}
            aria-invalid={(!!error && month != null) || undefined}
            numeric
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="Year"
            value={yearText}
            className={cn(error && month != null && "border-negative")}
            onChange={(e) => {
              const text = e.target.value.replace(/\D/g, "").slice(0, 4);
              setYearText(text);
              onChange({ month, year: text.length === 4 ? Number(text) : null });
            }}
          />
        </div>
        {error && <span className="text-caption text-negative">{error}</span>}
        {helper && !error && <span className="text-caption text-text-tertiary">{helper}</span>}
      </div>
    );
  }
);
BirthDateField.displayName = "BirthDateField";

export { BirthDateField };
export type { BirthDateFieldProps };
