"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SignInButton, useAuth, useUser } from "@/lib/auth";
import { Header } from "@/components/common/Header";
import { GlowButton } from "@/components/common/GlowButton";
import { SignInRequired } from "@/components/common/SignInRequired";
import { PageFooter } from "@/components/common/PageFooter";
import { createScenariosApi } from "@/lib/api/scenarios";
import type { SavedScenario } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/formatting";

function ScenarioCard({
  scenario,
  onDelete,
}: {
  scenario: SavedScenario;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const date = new Date(scenario.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const filingLabel =
    scenario.filing_status === "married_filing_jointly" ? "Married filing jointly" : "Single";

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-body font-semibold text-text-primary">{scenario.name}</span>
          <span className="font-mono text-caption text-text-tertiary">{date}</span>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-body-sm text-text-tertiary transition-colors duration-200 hover:text-negative"
            aria-label={`Delete ${scenario.name}`}
          >
            Delete
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onDelete(scenario.id)}
              className="text-body-sm font-medium text-negative transition-colors duration-200 hover:underline"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-body-sm text-text-tertiary transition-colors duration-200 hover:text-text-secondary"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-text-tertiary">Filing status</span>
          <span className="text-body-sm text-text-primary">{filingLabel}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-text-tertiary">IRA balance</span>
          <span className="font-data text-body-sm text-text-primary">
            {formatCurrency(scenario.ira_balance)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-text-tertiary">Horizon</span>
          <span className="text-body-sm text-text-primary">
            {scenario.num_years} {scenario.num_years === 1 ? "year" : "years"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-text-tertiary">Est. tax savings</span>
          <span className="font-data text-body-sm font-semibold text-optimal">
            {formatCurrency(scenario.estimated_savings)}
          </span>
        </div>
      </div>

      <Link
        href={`/calculator?saved=${scenario.id}`}
        className="btn-ghost w-full text-center text-body-sm"
      >
        Re-run this scenario
      </Link>
    </div>
  );
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

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const api = createScenariosApi(getToken);
        await api.delete(id);
        setScenarios((prev) => prev.filter((s) => s.id !== id));
      } catch {
        setLoadError("Could not delete the scenario. Please try again.");
      }
    },
    [getToken]
  );

  if (!isLoaded) return null;

  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <div className="mx-auto flex max-w-content flex-col gap-section">
          <div className="flex flex-col gap-3">
            <span className="eyebrow-pine block">Your history</span>
            <h1 className="display-heading text-display">
              Saved <em>scenarios.</em>
            </h1>
            <p className="max-w-[560px] text-body leading-relaxed text-text-secondary">
              Each scenario captures your inputs and results so you can compare strategies and pick
              up where you left off.
            </p>
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
            <div className="flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card animate-pulse">
                  <div className="h-5 w-1/3 rounded bg-paper-warm" />
                  <div className="mt-4 h-16 w-full rounded bg-paper-warm" />
                  <div className="mt-4 h-9 w-full rounded bg-paper-warm" />
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

          {isSignedIn && !loadingList && !loadError && scenarios.length === 0 && (
            <div className="card flex flex-col items-center gap-4 py-12 text-center">
              <span className="text-4xl">📊</span>
              <div className="flex flex-col gap-1">
                <p className="text-body font-medium text-text-primary">No saved scenarios yet</p>
                <p className="max-w-[400px] text-body-sm text-text-secondary">
                  Run the optimizer and your results will be saved automatically when you are signed
                  in.
                </p>
              </div>
              <Link href="/calculator" className="btn-dark">
                Run your scenario
              </Link>
            </div>
          )}

          {isSignedIn && !loadingList && !loadError && scenarios.length > 0 && (
            <div className="flex flex-col gap-4">
              {scenarios.map((scenario) => (
                <ScenarioCard key={scenario.id} scenario={scenario} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </main>
      <PageFooter />
    </>
  );
}
