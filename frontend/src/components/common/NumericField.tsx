"use client";

import * as React from "react";
import { NumericFormat } from "react-number-format";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

interface NumericFieldProps {
  label?: string;
  helper?: string;
  error?: string;
  tooltip?: string;
  value: number | "";
  placeholder?: string;
  min?: number;
  max?: number;
  suffix?: string;
  /** Unit shown inside the right edge of the box, e.g. "%". Not part of the value. */
  unit?: string;
  decimalScale?: number;
  required?: boolean;
  onChange: (value: number | null) => void;
  className?: string;
  id?: string;
}

const NumericField = React.forwardRef<HTMLInputElement, NumericFieldProps>(
  (
    {
      label,
      helper,
      error,
      tooltip,
      value,
      placeholder,
      min,
      max,
      suffix,
      unit,
      decimalScale = 0,
      required,
      onChange,
      className,
      id,
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <div className="flex items-center gap-1">
            <Label htmlFor={inputId}>{label}</Label>
            {required && (
              <span aria-hidden="true" className="-ml-0.5 text-negative" data-required-indicator>
                *
              </span>
            )}
            {tooltip && <Tooltip content={tooltip} />}
          </div>
        )}
        <div className="relative">
          <NumericFormat
            getInputRef={ref}
            id={inputId}
            value={value === "" ? "" : value}
            decimalScale={decimalScale}
            allowNegative={false}
            placeholder={placeholder}
            suffix={suffix}
            inputMode="decimal"
            aria-required={required || undefined}
            aria-invalid={!!error || undefined}
            isAllowed={(values) => {
              const v = values.floatValue;
              if (v === undefined) return true;
              if (min !== undefined && v < min) return false;
              if (max !== undefined && v > max) return false;
              return true;
            }}
            onValueChange={(values) => {
              onChange(values.floatValue ?? null);
            }}
            className={cn(
              "h-9 min-h-[44px] w-full px-3",
              "rounded-[10px] bg-white",
              "border border-border",
              "text-body text-text-primary",
              "placeholder:text-text-tertiary",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-pine-mid/15",
              "transition-all duration-300",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "font-data",
              unit && "pr-8",
              error && "border-negative",
              className
            )}
          />
          {unit && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-body text-text-tertiary">
              {unit}
            </span>
          )}
        </div>
        {error && <span className="text-caption text-negative">{error}</span>}
        {helper && !error && <span className="text-caption text-text-tertiary">{helper}</span>}
      </div>
    );
  }
);
NumericField.displayName = "NumericField";

export { NumericField };
export type { NumericFieldProps };
