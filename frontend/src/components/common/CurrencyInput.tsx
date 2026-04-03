"use client";

import * as React from "react";
import { useState, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  label?: string;
  helper?: string;
  error?: string;
  value: number | "";
  placeholder?: string;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  id?: string;
}

function formatDisplay(val: number | ""): string {
  if (val === "" || val === 0) return "";
  return val.toLocaleString("en-US");
}

function parseInput(raw: string): number {
  const stripped = raw.replace(/[^0-9.\-]/g, "");
  return parseFloat(stripped) || 0;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ label, helper, error, value, placeholder, min, step, onChange, className, id }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const [focused, setFocused] = useState(false);
    const innerRef = useRef<HTMLInputElement>(null);
    const resolvedRef = (ref as React.RefObject<HTMLInputElement>) || innerRef;

    const displayValue = focused
      ? value === 0 ? "" : String(value)
      : formatDisplay(value);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInput(e.target.value);
        if (min !== undefined && parsed < min) return;
        onChange(parsed);
      },
      [onChange, min]
    );

    const handleFocus = useCallback(() => setFocused(true), []);
    const handleBlur = useCallback(() => setFocused(false), []);

    return (
      <div className="flex flex-col gap-1.5">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary text-body select-none pointer-events-none">
            $
          </span>
          <Input
            ref={resolvedRef}
            id={inputId}
            type="text"
            inputMode="decimal"
            numeric
            value={displayValue}
            placeholder={placeholder}
            step={step}
            className={cn("pl-7", error && "border-negative", className)}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>
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
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
export type { CurrencyInputProps };
