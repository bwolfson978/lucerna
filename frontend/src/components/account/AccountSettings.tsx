"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DeleteAccountCard } from "@/components/common/DeleteAccountCard";
import type { AccountProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";

export interface AccountData {
  /** Saved scenarios in the account; null while loading or when the list failed. */
  count: number | null;
  /** ISO date of the newest saved scenario. */
  lastSaved: string | null;
  /** The list couldn't load. */
  failed?: boolean;
}

interface AccountSettingsProps {
  profile: AccountProfile;
  data: AccountData;
  /** Opens the sign-in provider's own account settings. */
  onManageSignIn?: () => void;
  onDownload?: () => void;
  onRetryData?: () => void;
  onDelete: () => Promise<void>;
  /** Opens the delete dialog on first render (Storybook, screenshots). */
  deleteDialogOpen?: boolean;
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
  className: "shrink-0",
} as const;

const SECTIONS = [
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg {...ICON}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    id: "data",
    label: "Your data",
    icon: (
      <svg {...ICON}>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </svg>
    ),
  },
  {
    id: "delete",
    label: "Delete account",
    danger: true,
    icon: (
      <svg {...ICON}>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Account settings: who you are, what's saved, and the way to delete it all. */
export function AccountSettings({
  profile,
  data,
  onManageSignIn,
  onDownload,
  onRetryData,
  onDelete,
  deleteDialogOpen,
}: AccountSettingsProps) {
  const [active, setActive] = useState<string>("profile");
  const canDownload = Boolean(onDownload) && (data.count ?? 0) > 0;

  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-h1 text-text-primary">Account settings</h1>
        <p className="max-w-[560px] text-body-sm text-text-secondary sm:text-[15px]">
          How you sign in, what&apos;s saved in your account, and how to remove it.
        </p>
      </div>

      <div className="flex flex-col gap-comfortable lg:flex-row lg:items-start lg:gap-section">
        <nav
          aria-label="Account sections"
          className="-mx-default flex gap-1 overflow-x-auto px-default lg:sticky lg:top-24 lg:mx-0 lg:w-[220px] lg:shrink-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              aria-current={active === s.id ? "true" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2.5 rounded-sm px-2.5 text-body-sm font-medium transition-colors duration-200 hover:bg-paper-deep lg:h-9",
                "danger" in s
                  ? "text-negative"
                  : active === s.id
                    ? "bg-paper-warm text-text-primary"
                    : "text-text-secondary hover:text-text-primary"
              )}
            >
              {s.icon}
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <SettingsCard
            id="profile"
            title="Profile"
            description="Your name and email come from the account you signed in with."
            foot={
              <>
                <span className="text-caption font-normal text-text-tertiary">
                  Change your name or email with your sign-in provider.
                </span>
                {onManageSignIn && (
                  <Button variant="outline" size="sm" onClick={onManageSignIn}>
                    Manage sign-in
                  </Button>
                )}
              </>
            }
          >
            <Facts
              rows={[
                ["Name", profile.name || "Not set"],
                ["Email", profile.email],
                [
                  "Sign-in",
                  <span
                    key="chip"
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[12px] font-medium text-text-secondary"
                  >
                    <i className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
                    {profile.signIn}
                  </span>,
                ],
              ]}
            />
          </SettingsCard>

          <SettingsCard
            id="data"
            title="Your data"
            description="Scenarios you save here, or from Claude or ChatGPT, all live in this account."
            foot={
              <>
                <span className="text-caption font-normal text-text-tertiary">
                  A CSV with each scenario&apos;s name, date and headline results.
                </span>
                <Button variant="outline" size="sm" onClick={onDownload} disabled={!canDownload}>
                  Download scenarios
                </Button>
              </>
            }
          >
            {data.failed ? (
              <p className="text-body-sm text-negative">
                We couldn&apos;t load your saved scenarios.{" "}
                {onRetryData && (
                  <button type="button" onClick={onRetryData} className="font-semibold underline">
                    Try again
                  </button>
                )}
              </p>
            ) : (
              <Facts
                rows={[
                  [
                    "Saved scenarios",
                    <span key="count" className="font-data">
                      {data.count === null
                        ? "Loading"
                        : `${data.count} ${data.count === 1 ? "scenario" : "scenarios"}`}
                      <Link
                        href="/my-scenarios"
                        className="ml-2 font-semibold text-pine underline-offset-2 hover:underline"
                      >
                        View all
                      </Link>
                    </span>,
                  ],
                  [
                    "Last saved",
                    <span key="last" className="font-data">
                      {data.lastSaved
                        ? formatDate(data.lastSaved)
                        : data.count === null
                          ? ""
                          : "Never"}
                    </span>,
                  ],
                ]}
              />
            )}
          </SettingsCard>

          <DeleteAccountCard
            scenarioCount={data.failed ? null : data.count}
            onDelete={onDelete}
            onDownload={canDownload ? onDownload : undefined}
            defaultOpen={deleteDialogOpen}
          />
        </div>
      </div>
    </div>
  );
}

function SettingsCard({
  id,
  title,
  description,
  children,
  foot,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  foot: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-24 overflow-hidden rounded-md border border-border bg-card sm:rounded-lg"
    >
      <div className="flex flex-col gap-default p-comfortable sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-heading`} className="text-[18px] font-semibold leading-[1.3]">
            {title}
          </h2>
          <p className="text-body-sm text-text-secondary">{description}</p>
        </div>
        {children}
      </div>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border bg-paper px-comfortable py-3 sm:px-6">
        {foot}
      </div>
    </section>
  );
}

/** Label and value rows; the label sits above the value on phones. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 rounded-[10px] border border-border sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
      {rows.map(([label, value], i) => (
        <div key={label} className={cn("contents", i > 0 && "[&>*:first-child]:border-t")}>
          <dt className="min-w-0 border-border px-3.5 pb-0 pt-3 text-caption text-text-tertiary sm:py-3">
            {label}
          </dt>
          <dd
            className={cn(
              "min-w-0 break-words border-border px-3.5 pb-3 pt-0.5 text-body-sm text-text-primary sm:py-3",
              i > 0 && "sm:border-t"
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
