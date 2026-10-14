"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CopyFieldProps {
  /** Text shown and copied, e.g. a server URL. */
  value: string;
  /** Accessible name for the copy button's target, e.g. "server URL". */
  label: string;
  className?: string;
}

/** A read-only value in mono type with a Copy button beside it. */
export function CopyField({ value, label, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permissions): the text stays selectable.
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[12px] border border-border bg-white py-2 pl-4 pr-2",
        className
      )}
    >
      <code className="min-w-0 flex-1 break-all font-mono text-body-sm text-text-primary">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        className="min-h-[40px] shrink-0 rounded-full border border-border px-4 text-[14px] font-semibold text-pine-deep transition-colors duration-200 hover:border-pine-mid/40 hover:text-pine"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
