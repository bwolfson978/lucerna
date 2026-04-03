"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[12px] text-[15px] font-semibold tracking-[0.3px] transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]",
  {
    variants: {
      variant: {
        default:
          "btn-gradient-primary text-bg active:scale-[0.98]  hover:shadow-[0_8px_30px_rgba(240,198,116,0.25)]",
        secondary:
          "btn-gradient-secondary text-purple border border-purple/30 ",
        outline:
          "bg-transparent border border-[rgba(255,255,255,0.15)] text-text-primary hover:border-[rgba(255,255,255,0.25)] ",
        ghost:
          "bg-transparent text-text-primary border border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.25)] ",
        destructive:
          "bg-negative text-white hover:bg-negative/90 active:scale-[0.98]",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "py-3.5 px-8",
        sm: "py-2 px-4 text-body-sm",
        lg: "py-4 px-10",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
