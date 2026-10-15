"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { SignInButton, useAuth, useUser } from "@/lib/auth";
import { Header } from "@/components/common/Header";
import { GlowButton } from "@/components/common/GlowButton";
import { SignInRequired } from "@/components/common/SignInRequired";
import { PageFooter } from "@/components/common/PageFooter";
import { SavedScenariosTable } from "@/components/scenarios/SavedScenariosTable";
import { UndoToast } from "@/components/scenarios/UndoToast";
import { createScenariosApi } from "@/lib/api/scenarios";
import type { SavedScenario } from "@/lib/types";

const UNDO_MS = 8000;

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-border bg-white px-6 py-16 text-center shadow-[0_24px_60px_-34px_rgba(27,67,50,0.22)]">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-end justify-center gap-1 rounded-md bg-paper-warm pb-3.5"
      >
        <span className="h-3 w-[7px] rounded-[2px] bg-pine-mid" />
        <span className="h-[18px] w-[7px] rounded-[2px] bg-sage" />
        <span className="h-6 w-[7px] rounded-[2px] bg-pine-haze" />
        <span className="h-7 w-[7px] rounded-[2px] border-[1.5px] border-dashed border-sage" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[16px] font-semibold text-text-primary">No saved scenarios yet</p>
        <p className="max-w-[400px] text-body-sm text-text-secondary">
          Run the optimizer while you are signed in, or save one from Claude or ChatGPT, and it
          shows up here.
        </p>
      </div>
      <Link href="/calculator" className="btn-dark">
        Run your scenario
      </Link>
    </div>
  );
}

function deletedMessage(ids: string[], scenarios: SavedScenario[]) {
  if (ids.length > 1) return `Deleted ${ids.length} scenarios`;
  const name = scenarios.find((s) => s.id === ids[0])?.name;
  return name ? `Deleted “${name}”` : "Deleted 1 scenario";
}

export default function MyScenariosPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchScenarios = useCallback(async () => {
    setLoadingList(true);
    setLoadError(null);
    try {
      const api = createScenariosApi(getToken);
      const data = await api.list();
      setScenarios(data);
    } catch {
      setLoadError("Could not load your scenarios. Please try again.");
    } finally {
      setLoadingList(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      fetchScenarios();
    }
  }, [isLoaded, isSignedIn, fetchScenarios]);

  // Deletes wait out an undo window: the rows hide at once and the requests go out when
  // the toast ends, is dismissed, another delete starts, or the page is left.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ ids: string[]; message: string } | null>(null);
  const pending = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const tokenRef = useRef<string | null>(null);

  const unhide = (ids: string[]) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

  const commit = useCallback(
    (opts?: { keepalive?: boolean }) => {
      const current = pending.current;
      if (!current) return;
      clearTimeout(current.timer);
      pending.current = null;
      setToast(null);
      const { ids } = current;
      // While unloading there's no time to wait for a fresh token, so use the one fetched
      // when the delete started.
      const api = createScenariosApi(
        opts?.keepalive ? async () => tokenRef.current ?? getToken() : getToken
      );
      void Promise.allSettled(ids.map((id) => api.delete(id, opts))).then((results) => {
        const failed = new Set(ids.filter((_, i) => results[i].status === "rejected"));
        setScenarios((prev) => prev.filter((s) => !ids.includes(s.id) || failed.has(s.id)));
        unhide(ids);
        if (failed.size > 0) setLoadError("Could not delete the scenario. Please try again.");
      });
    },
    [getToken]
  );

  const handleDelete = useCallback(
    (ids: string[]) => {
      commit();
      setPendingIds((prev) => new Set([...prev, ...ids]));
      void getToken().then((t) => (tokenRef.current = t));
      pending.current = { ids, timer: setTimeout(() => commit(), UNDO_MS) };
      setToast({ ids, message: deletedMessage(ids, scenarios) });
    },
    [commit, getToken, scenarios]
  );

  const undo = () => {
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.timer);
    pending.current = null;
    setToast(null);
    unhide(current.ids);
  };

  useEffect(() => {
    const flush = () => commit({ keepalive: true });
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commit]);

  const visible = scenarios.filter((s) => !pendingIds.has(s.id));
  const ready = isSignedIn && !loadingList && !loadError;

  if (!isLoaded) return null;

  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <div className="mx-auto flex max-w-content flex-col gap-6 pb-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.01em] text-text-primary">
                  Saved scenarios
                </h1>
                {ready && (
                  <span className="font-data rounded-full bg-paper-warm px-[9px] py-0.5 text-[12px] font-semibold text-text-secondary">
                    {visible.length}
                  </span>
                )}
              </div>
              <p className="max-w-[560px] text-[15px] text-text-secondary">
                Each scenario keeps your inputs and results, so you can compare strategies and pick
                up where you left off.
              </p>
            </div>
            {isSignedIn && (
              <Link href="/calculator" className="btn-dark">
                New scenario
              </Link>
            )}
          </div>

          {!isSignedIn && (
            <SignInRequired
              title="Sign in to see your saved scenarios"
              description="Scenarios you save here or from a chat app are kept in your free account."
              signInButton={
                <SignInButton>
                  <GlowButton size="sm">Sign in</GlowButton>
                </SignInButton>
              }
            />
          )}

          {isSignedIn && loadingList && (
            <div
              aria-label="Loading your scenarios"
              className="overflow-hidden rounded-md border border-border bg-white"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-[60px] animate-pulse items-center gap-4 border-t border-border px-4 first:border-t-0"
                >
                  <div className="h-4 w-4 rounded bg-paper-warm" />
                  <div className="h-4 w-1/3 rounded bg-paper-warm" />
                  <div className="ml-auto hidden h-4 w-1/4 rounded bg-paper-warm md:block" />
                </div>
              ))}
            </div>
          )}

          {loadError && (
            <div className="card border-negative">
              <p className="text-body text-negative">{loadError}</p>
              <button
                type="button"
                onClick={fetchScenarios}
                className="mt-default text-body-sm font-medium text-accent transition-colors duration-300 hover:text-accent-hover"
              >
                Try again
              </button>
            </div>
          )}

          {ready && visible.length === 0 && <EmptyState />}

          {ready && visible.length > 0 && (
            <SavedScenariosTable scenarios={visible} onDelete={handleDelete} />
          )}
        </div>
      </main>
      {toast && (
        <UndoToast
          key={toast.ids.join(",")}
          message={toast.message}
          onUndo={undo}
          onDismiss={() => commit()}
          durationMs={UNDO_MS}
        />
      )}
      <PageFooter />
    </>
  );
}
