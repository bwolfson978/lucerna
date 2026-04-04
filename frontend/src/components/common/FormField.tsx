"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

interface FormFieldProps extends InputProps {
  label?: string;
  helper?: string;
  error?: string;
  tooltip?: string;
}

const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, helper, error, tooltip, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <div className="flex items-center gap-1">
            <Label htmlFor={inputId}>{label}</Label>
            {tooltip && <Tooltip content={tooltip} />}
          </div>
        )}
        <Input
          ref={ref}
          id={inputId}
          className={cn(error && "border-negative", className)}
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
FormField.displayName = "FormField";

export { FormField };
export type { FormFieldProps };
