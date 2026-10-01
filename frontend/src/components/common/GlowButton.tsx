"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GlowButtonProps = Omit<ButtonProps, "variant">;

const GlowButton = React.forwardRef<HTMLButtonElement, GlowButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Button ref={ref} className={cn("btn-dark", className)} {...props}>
        {children}
      </Button>
    );
  }
);

GlowButton.displayName = "GlowButton";

export { GlowButton };
export type { GlowButtonProps };
