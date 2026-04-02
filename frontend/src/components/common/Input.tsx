"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  numeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helper, error, numeric, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-caption text-text-secondary font-medium"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            h-9 min-h-[44px] px-3
            rounded-lg bg-bg-alt
            border border-border
            text-body text-text-primary
            placeholder:text-text-tertiary
            focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10
            transition-all duration-300
            ${numeric ? "font-mono" : ""}
            ${error ? "border-negative" : ""}
            ${className}
          `}
          {...props}
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

Input.displayName = "Input";
