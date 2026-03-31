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
        className={cn(
          "h-9 min-h-[44px] px-3 w-full",
          "rounded-md bg-bg-alt",
          "border border-border",
          "text-body text-text-primary",
          "placeholder:text-text-tertiary",
          "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10",
          "transition-all duration-150",
          "disabled:opacity-50 disabled:cursor-not-allowed",
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
