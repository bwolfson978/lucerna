"use client";

import * as React from "react";
import { Select, type SelectProps } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/common/Tooltip";
import { cn } from "@/lib/utils";

interface FormSelectProps extends SelectProps {
  label?: string;
  helper?: string;
  error?: string;
  tooltip?: string;
}

const FormSelect = React.forwardRef<HTMLButtonElement, FormSelectProps>(
  ({ label, helper, error, tooltip, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <div className="flex items-center gap-1">
            <Label htmlFor={selectId}>{label}</Label>
            {tooltip && <Tooltip content={tooltip} />}
          </div>
        )}
        <Select
          ref={ref}
          id={selectId}
          className={cn(error && "border-negative", className)}
          {...props}
        />
        {error && <span className="text-caption text-negative">{error}</span>}
        {helper && !error && <span className="text-caption text-text-tertiary">{helper}</span>}
      </div>
    );
  }
);
FormSelect.displayName = "FormSelect";

export { FormSelect };
export type { FormSelectProps };
