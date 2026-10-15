"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface AccountIdentity {
  name: string;
  email: string;
}

interface AccountMenuProps {
  account: AccountIdentity;
  onSignOut: () => void;
  /** Starts open (Storybook, screenshots). */
  defaultOpen?: boolean;
}

const ITEM =
  "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-left text-body-sm text-text-primary transition-colors duration-200 hover:bg-paper-warm [&_svg]:shrink-0 [&_svg]:text-text-tertiary";

/** The signed-in avatar in the header: who you are, your scenarios, settings and sign out. */
export function AccountMenu({ account, onSignOut, defaultOpen = false }: AccountMenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (account.name || account.email).trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="account-menu"
        className={cn(
          "flex h-[34px] w-[34px] items-center justify-center rounded-full bg-pine-mid text-[13px] font-semibold text-[#f5f2ea] transition-shadow duration-200 hover:shadow-[0_0_0_3px_#e9e5dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine-mid",
          open && "shadow-[0_0_0_3px_#e9e5dc]"
        )}
      >
        {initial}
      </button>
      {open && (
        <div
          id="account-menu"
          className="absolute right-0 top-[calc(100%+10px)] z-50 flex w-60 flex-col rounded-[12px] border border-border bg-card p-1.5 shadow-elevated"
        >
          <div className="flex min-w-0 flex-col gap-0.5 px-2.5 pb-2.5 pt-2">
            <span className="truncate text-body-sm font-semibold text-text-primary">
              {account.name || account.email}
            </span>
            {account.name && (
              <span className="truncate text-caption font-normal text-text-tertiary">
                {account.email}
              </span>
            )}
          </div>
          <div className="-mx-1.5 my-1.5 h-px bg-border" role="separator" />
          <Link href="/my-scenarios" className={ITEM} onClick={() => setOpen(false)}>
            <svg {...ICON}>
              <path d="M4 20V10" />
              <path d="M10 20V6" />
              <path d="M16 20v-8" />
              <path d="M22 20H2" />
            </svg>
            My scenarios
          </Link>
          <Link href="/account" className={ITEM} onClick={() => setOpen(false)}>
            <svg {...ICON}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            Account settings
          </Link>
          <div className="-mx-1.5 my-1.5 h-px bg-border" role="separator" />
          <button type="button" className={ITEM} onClick={onSignOut}>
            <svg {...ICON}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const ICON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;
