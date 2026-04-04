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
  decimalScale?: number;
  onChange: (value: number | null) => void;
  className?: string;
  id?: string;
}

const NumericField = React.forwardRef<HTMLInputElement, NumericFieldProps>(
  ({ label, helper, error, tooltip, value, placeholder, min, max, suffix, decimalScale = 0, onChange, className, id }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <div className="flex items-center gap-1">
            <Label htmlFor={inputId}>{label}</Label>
            {tooltip && <Tooltip content={tooltip} />}
          </div>
        )}
        <NumericFormat
          getInputRef={ref}
          id={inputId}
          value={value === "" ? "" : value}
          decimalScale={decimalScale}
          allowNegative={false}
          placeholder={placeholder}
          suffix={suffix}
          inputMode="decimal"
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
            "h-9 min-h-[44px] px-3 w-full",
            "rounded-lg bg-bg-alt",
            "border border-border",
            "text-body text-text-primary",
            "placeholder:text-text-tertiary",
            "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10",
            "transition-all duration-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "font-mono",
            error && "border-negative",
            className
          )}
        />
        {error && (
          <span className="text-caption text-negative">{error}</span>
        )}
        {helper && !error && (
          <span className="text-caption text-text-tertiary">{helper}</span>
        )}
      </div>
    );
  }
);
NumericField.displayName = "NumericField";

export { NumericField };
export type { NumericFieldProps };
