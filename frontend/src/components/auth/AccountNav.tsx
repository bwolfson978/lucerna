"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { useAccount } from "@/lib/auth/account";
import { cn } from "@/lib/utils";

/** Header account controls: "Sign in", or "My scenarios" and the account menu. Nothing
 * when accounts aren't configured. */
export function AccountNav({ active }: { active: boolean }) {
  const account = useAccount();
  if (!account.enabled || !account.loaded) return null;
  if (!account.signedIn) {
    return (
      <button
        type="button"
        onClick={account.openSignIn}
        className="text-[15px] font-medium text-text-secondary transition-colors duration-200 hover:text-text-primary"
      >
        Sign in
      </button>
    );
  }
  return (
    <>
      <Link
        href="/scenarios"
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-[15px] font-medium transition-colors duration-200 hover:text-text-primary",
          active ? "text-pine" : "text-text-secondary"
        )}
      >
        My scenarios
      </Link>
      <UserButton />
    </>
  );
}

/** The same controls in the mobile menu. */
export function MobileAccountNav({
  onLinkClick,
  onClose,
}: {
  onLinkClick: () => void;
  onClose: () => void;
}) {
  const account = useAccount();
  if (!account.enabled || !account.loaded) return null;
  const itemClass =
    "rounded-lg px-2 py-2.5 text-left text-body text-text-secondary transition-colors duration-200 hover:bg-paper-warm hover:text-pine";
  if (!account.signedIn) {
    return (
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onClose();
          account.openSignIn();
        }}
      >
        Sign in
      </button>
    );
  }
  return (
    <>
      <Link href="/scenarios" onClick={onLinkClick} className={itemClass}>
        My scenarios
      </Link>
      <div className="flex items-center gap-3 px-2 py-2.5">
        <UserButton />
        <span className="text-body-sm text-text-tertiary">Account</span>
      </div>
    </>
  );
}
