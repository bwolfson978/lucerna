"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  numeric?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, numeric, type, ...props }, ref) => {
    return (
      <input
        type={type}
        inputMode={numeric ? "decimal" : undefined}
        className={cn(
          "h-9 min-h-[44px] w-full px-3",
          "rounded-lg bg-bg-alt",
          "border border-border",
          "text-body text-text-primary",
          "placeholder:text-text-tertiary",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10",
          "transition-all duration-300",
          "disabled:cursor-not-allowed disabled:opacity-50",
          numeric && "font-mono",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
export type { InputProps };
