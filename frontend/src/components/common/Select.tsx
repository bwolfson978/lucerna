"use client";

import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helper?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helper, error, options, className = "", id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-caption text-text-secondary font-medium"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            h-9 min-h-[44px] px-3
            rounded-md bg-bg-alt
            border border-border
            text-body text-text-primary
            focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10
            transition-all duration-150
            ${error ? "border-negative" : ""}
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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

Select.displayName = "Select";
