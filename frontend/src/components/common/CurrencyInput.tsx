"use client";

import * as React from "react";
import { NumericFormat } from "react-number-format";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  label?: string;
  helper?: string;
  error?: string;
  tooltip?: string;
  value: number | "";
  placeholder?: string;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  id?: string;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ label, helper, error, tooltip, value, placeholder, min, onChange, className, id }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <div className="flex items-center gap-1">
            <Label htmlFor={inputId}>{label}</Label>
            {tooltip && <Tooltip content={tooltip} />}
          </div>
        )}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-body text-text-tertiary">
            $
          </span>
          <NumericFormat
            getInputRef={ref}
            id={inputId}
            value={value === "" || value === 0 ? "" : value}
            thousandSeparator=","
            decimalScale={0}
            allowNegative={false}
            placeholder={placeholder}
            inputMode="decimal"
            isAllowed={(values) => {
              if (min !== undefined && values.floatValue !== undefined && values.floatValue < min) {
                return false;
              }
              return true;
            }}
            onValueChange={(values) => {
              onChange(values.floatValue ?? 0);
            }}
            className={cn(
              "h-9 min-h-[44px] w-full px-3",
              "rounded-lg bg-bg-alt",
              "border border-border",
              "text-body text-text-primary",
              "placeholder:text-text-tertiary",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10",
              "transition-all duration-300",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "font-mono",
              "pl-7",
              error && "border-negative",
              className
            )}
          />
        </div>
        {error && <span className="text-caption text-negative">{error}</span>}
        {helper && !error && <span className="text-caption text-text-tertiary">{helper}</span>}
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
export type { CurrencyInputProps };
