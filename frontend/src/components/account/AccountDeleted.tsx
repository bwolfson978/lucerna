import Link from "next/link";

interface AccountDeletedProps {
  /** Scenarios deleted with the account; null when unknown. */
  scenarioCount: number | null;
}

/** Shown in place of Account settings once the account is gone and the person is signed out. */
export function AccountDeleted({ scenarioCount }: AccountDeletedProps) {
  const what =
    scenarioCount === null || scenarioCount === 0
      ? "your account"
      : scenarioCount === 1
        ? "your account and your saved scenario"
        : `your account and all ${scenarioCount} saved scenarios`;

  return (
    <div className="mx-auto flex w-full max-w-[620px] flex-col items-start gap-comfortable py-section sm:py-page">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pine-mid/10 text-pine-mid">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <span className="eyebrow">Account deleted</span>
      <h1 className="display-heading text-display">
        Your account is <em>gone.</em>
      </h1>
      <p className="text-body text-text-secondary">
        We deleted {what}, and signed you out. Thanks for planning with us.
      </p>
      <div className="flex w-full gap-2.5 rounded-[10px] bg-paper-warm px-3.5 py-3 text-body-sm text-text-secondary">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-[3px] shrink-0"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
        <span>
          If you added Roth Conversions Optimizer to Claude or ChatGPT, remove it in that app&apos;s
          connector settings too.
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href="/" className="btn-dark">
          Back to home
        </Link>
        <Link href="/calculator" className="btn-ghost">
          Try the calculator
        </Link>
      </div>
    </div>
  );
}
