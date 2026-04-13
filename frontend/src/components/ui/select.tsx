"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cn } from "@/lib/utils";

interface SelectProps {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      className,
      options,
      value,
      onChange,
      id,
      disabled,
      placeholder,
      "aria-required": ariaRequired,
      "aria-invalid": ariaInvalid,
    },
    ref
  ) => {
    const selectedLabel = options.find((o) => o.value === value)?.label ?? "";
    // Radix reserves "" as "clear selection". Convert our null/empty state
    // to `undefined` so the placeholder renders instead.
    const radixValue = value ? value : undefined;

    return (
      <SelectPrimitive.Root
        value={radixValue}
        onValueChange={(val) => onChange?.({ target: { value: val } })}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          id={id}
          aria-required={ariaRequired || undefined}
          aria-invalid={ariaInvalid || undefined}
          className={cn(
            "h-9 min-h-[44px] w-full px-3",
            "rounded-lg bg-bg-alt",
            "border border-border",
            "text-left text-body text-text-primary",
            "data-[placeholder]:text-text-tertiary",
            "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10",
            "transition-all duration-300",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "flex items-center justify-between",
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder}>
            {selectedLabel || undefined}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="text-text-tertiary"
            >
              <path
                d="M3 4.5L6 7.5L9 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={cn(
              "z-50 min-w-[var(--radix-select-trigger-width)]",
              "max-h-[min(var(--radix-select-content-available-height,20rem),20rem)]",
              "overflow-hidden",
              "rounded-lg border border-glass-border",
              "shadow-elevated",
              "animate-in fade-in-0 zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            )}
            style={{
              background: "rgba(26, 24, 50, 0.95)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center text-text-tertiary">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 7.5L6 4.5L9 7.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1">
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  className={cn(
                    "relative flex items-center rounded-md px-3 py-2.5",
                    "cursor-pointer text-body-sm text-text-primary",
                    "select-none outline-none",
                    "data-[highlighted]:bg-glass-bg-hover data-[highlighted]:text-accent",
                    "transition-colors duration-150"
                  )}
                >
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center text-text-tertiary">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }
);
Select.displayName = "Select";

export { Select };
export type { SelectProps };
