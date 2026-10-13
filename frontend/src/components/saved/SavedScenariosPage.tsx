"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { useAccount } from "@/lib/auth/account";
import {
  SavedScenarioError,
  savedScenarioHref,
  savedScenarios,
  type SavedScenarioSummary,
} from "@/lib/api/savedScenarios";
import { formatCompactCurrency } from "@/lib/utils/formatting";

type Load =
  | { state: "loading" }
  | { state: "ready"; scenarios: SavedScenarioSummary[] }
  | { state: "error"; message: string };

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

function details(s: SavedScenarioSummary): string {
  const parts = [];
  if (s.age != null) parts.push(`Age ${s.age}`);
  if (s.filing_status) parts.push(s.filing_status === "single" ? "Single" : "Married");
  if (s.traditional_balance != null)
    parts.push(`${formatCompactCurrency(s.traditional_balance)} pre-tax`);
  if (s.retirement_age != null) parts.push(`retire at ${s.retirement_age}`);
  return parts.join(" · ");
}

export function SavedScenariosPage() {
  const account = useAccount();
  const [load, setLoad] = useState<Load>({ state: "loading" });

  const refresh = useCallback(() => {
    savedScenarios
      .list()
      .then((scenarios) => setLoad({ state: "ready", scenarios }))
      .catch((err) =>
        setLoad({
          state: "error",
          message:
            err instanceof SavedScenarioError
              ? err.message
              : "Your scenarios couldn't be loaded. Try again.",
        })
      );
  }, []);

  useEffect(() => {
    if (account.loaded && account.signedIn) refresh();
  }, [account.loaded, account.signedIn, refresh]);

  const replace = (next: SavedScenarioSummary) =>
    setLoad((prev) =>
      prev.state === "ready"
        ? {
            ...prev,
            scenarios: prev.scenarios.map((s) => (s.scenario_id === next.scenario_id ? next : s)),
          }
        : prev
    );
  const drop = (id: string) =>
    setLoad((prev) =>
      prev.state === "ready"
        ? { ...prev, scenarios: prev.scenarios.filter((s) => s.scenario_id !== id) }
        : prev
    );

  let body;
  if (!account.enabled) {
    body = <Message>Saving scenarios isn&apos;t available right now.</Message>;
  } else if (!account.loaded || (account.signedIn && load.state === "loading")) {
    body = (
      <div className="card animate-pulse text-body-sm text-text-tertiary" role="status">
        Loading your scenarios…
      </div>
    );
  } else if (!account.signedIn) {
    body = (
      <Message>
        <p>Sign in to see the scenarios you&apos;ve saved, here or from Claude.</p>
        <button type="button" onClick={account.openSignIn} className="btn-dark mt-default">
          Sign in
        </button>
      </Message>
    );
  } else if (load.state === "error") {
    body = (
      <Message>
        <p role="alert">{load.message}</p>
        <button type="button" onClick={refresh} className="btn-ghost mt-default">
          Try again
        </button>
      </Message>
    );
  } else if (load.state === "ready" && load.scenarios.length === 0) {
    body = (
      <Message>
        <p>
          No saved scenarios yet. Run your numbers, then tap <strong>Save scenario</strong> to keep
          them here.
        </p>
        <Link href="/calculator" className="btn-dark mt-default">
          Run your scenario
        </Link>
      </Message>
    );
  } else if (load.state === "ready") {
    body = (
      <ul className="flex flex-col gap-default">
        {load.scenarios.map((s) => (
          <SavedScenarioRow key={s.scenario_id} scenario={s} onChange={replace} onDelete={drop} />
        ))}
      </ul>
    );
  }

  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <div className="mx-auto flex max-w-[760px] flex-col gap-section">
          <div className="flex flex-col gap-3">
            <span className="eyebrow-pine block">Your account</span>
            <h1 className="display-heading text-display">
              My <em>scenarios.</em>
            </h1>
            <p className="max-w-[620px] text-body leading-relaxed text-text-secondary">
              Scenarios you save on this site or from Claude. Open one to pick up where you left
              off; results are recalculated with the latest tax rules.
            </p>
          </div>
          {body}
        </div>
      </main>
      <PageFooter />
    </>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start text-body text-text-secondary">{children}</div>
  );
}

function SavedScenarioRow({
  scenario,
  onChange,
  onDelete,
}: {
  scenario: SavedScenarioSummary;
  onChange: (next: SavedScenarioSummary) => void;
  onDelete: (id: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "confirm-delete">("view");
  const [name, setName] = useState(scenario.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof SavedScenarioError ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const rename = () =>
    run(async () => {
      const next = await savedScenarios.rename(scenario.scenario_id, name);
      onChange(next);
      setMode("view");
    });

  const remove = () =>
    run(async () => {
      await savedScenarios.remove(scenario.scenario_id);
      posthog.capture("saved_scenario_deleted");
      onDelete(scenario.scenario_id);
    });

  return (
    <li className="card flex flex-col gap-default">
      {mode === "rename" ? (
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label className="sr-only" htmlFor={`name-${scenario.scenario_id}`}>
            Scenario name
          </label>
          <input
            id={`name-${scenario.scenario_id}`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            className="min-h-[44px] flex-1 rounded-[10px] border border-border bg-white px-3 text-body focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine-mid/15"
            autoFocus
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-dark">
              Save name
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setName(scenario.name);
                setMode("view");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-[22px] font-semibold leading-tight text-text-primary">
            {scenario.name}
          </h2>
          <p className="text-body-sm text-text-secondary">{details(scenario)}</p>
          <p className="text-body-sm text-text-tertiary">
            Saved {DATE.format(new Date(scenario.saved_at))}
            {!scenario.complete && " · some details still needed"}
          </p>
        </div>
      )}
      {mode === "confirm-delete" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-body-sm text-text-secondary">Delete this scenario?</p>
          <button type="button" disabled={busy} onClick={() => void remove()} className="btn-dark">
            Delete
          </button>
          <button type="button" className="btn-ghost" onClick={() => setMode("view")}>
            Keep it
          </button>
        </div>
      ) : (
        mode === "view" && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link
              href={savedScenarioHref(scenario.scenario_id)}
              className="btn-dark min-h-[40px] px-6 py-2 text-[14.5px]"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={() => setMode("rename")}
              className="text-body-sm text-text-secondary underline decoration-border underline-offset-4 hover:text-text-primary"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-delete")}
              className="text-body-sm text-text-secondary underline decoration-border underline-offset-4 hover:text-text-primary"
            >
              Delete
            </button>
          </div>
        )
      )}
      {error && (
        <p role="alert" className="text-body-sm text-negative">
          {error}
        </p>
      )}
    </li>
  );
}
