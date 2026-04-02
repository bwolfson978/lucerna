"use client";

import { ReactNode, useState } from "react";
import {
  Tooltip as TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface TooltipProps {
  content: string;
  children?: ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipRoot open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        {children || (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpen((prev) => !prev);
            }}
            className="inline-flex items-center justify-center w-5 h-5 text-text-tertiary hover:text-text-secondary transition-colors duration-300"
            aria-label="More info"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
              <text
                x="7"
                y="10.5"
                textAnchor="middle"
                fill="currentColor"
                fontSize="9"
                fontWeight="600"
              >
                ?
              </text>
            </svg>
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent
        onPointerDownOutside={() => setOpen(false)}
      >
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}
