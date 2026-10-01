"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useUser, useAuth, SignInButton } from "@clerk/nextjs";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { InputForm } from "@/components/calculator/InputForm";
import { ResultsView } from "@/components/results/ResultsView";
import { MetricCardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/common/Skeleton";
import { apiClient } from "@/lib/api/client";
import { createScenariosApi } from "@/lib/api/scenarios";
import type { ScenarioInput, OptimizationResult } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { MethodologyLayout } from "@/components/methodology/MethodologyLayout";
import { SaveResultsBanner } from "@/components/common/SaveResultsBanner";
import { GlowButton } from "@/components/common/GlowButton";
import type { SaveBannerState } from "@/components/common/SaveResultsBanner";

export default function CalculatorPage() {
  return (
    <Suspense>
      <CalculatorContent />
    </Suspense>
  );
}

function CalculatorContent() {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [bannerState, setBannerState] = useState<SaveBannerState>("prompt");
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const resultsRef = useRef<HTMLDivElement>(null);
  const lastInputRef = useRef<ScenarioInput | null>(null);

  const showBanner =
    !!result &&
    isLoaded &&
    !bannerDismissed &&
    (!isSignedIn || bannerState === "saving" || bannerState === "saved");

  // Scroll to results when loading starts
  useEffect(() => {
    if (loading && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  // Load saved scenario from URL param on mount
  useEffect(() => {
    const scenarioId = searchParams.get("scenario");
    if (!scenarioId || !isLoaded || !isSignedIn) return;

    const scenariosApi = createScenariosApi(getToken);
    scenariosApi.get(scenarioId).then((detail) => {
      handleSubmit(detail.inputs);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  const handleSubmit = useCallback(
    async (input: ScenarioInput) => {
      setLoading(true);
      setError(null);
      setResult(null);
      setBannerState("prompt");
      lastInputRef.current = input;

      posthog.capture("scenario_submitted", {
        filing_status: input.filing_status,
        num_years: input.timeline?.length ?? 1,
        has_life_events: input.timeline?.some((y) => y.notes && y.notes.trim() !== "") ?? false,
      });

      try {
        const data = await apiClient.optimize(input as unknown as Record<string, unknown>);
        const optimized = data as OptimizationResult;
        setResult(optimized);
        posthog.capture("scenario_completed");

        // Auto-save when signed in
        if (isSignedIn) {
          setBannerDismissed(false);
          setBannerState("saving");
          const scenariosApi = createScenariosApi(getToken);
          scenariosApi
            .save(input, optimized)
            .then(() => setBannerState("saved"))
            .catch(() => setBannerState("prompt"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Optimization failed");
      } finally {
        setLoading(false);
      }
    },
    [isSignedIn, getToken]
  );

  return (
    <MethodologyProvider>
      <Header />
      <MethodologyLayout result={result ?? undefined}>
        <main className="px-default py-section-lg md:px-page">
          <div className="mx-auto flex max-w-content flex-col gap-section">
            {/* Form section */}
            <div
              className={cn(
                "-mx-default border-b border-border px-default pb-section md:-mx-page md:px-page",
                !result && !loading && !error ? "" : "shadow-sm"
              )}
            >
              <div className="mx-auto flex max-w-content flex-col gap-default">
                <div className="flex flex-col gap-3">
                  <span className="eyebrow-pine block">Your scenario</span>
                  <h1 className="display-heading text-display">
                    Run <em>your numbers.</em>
                  </h1>
                  <p className="max-w-[620px] text-body leading-relaxed text-text-secondary">
                    Enter your details and the optimizer will find the Roth conversion schedule that
                    maximizes your after-tax wealth.
                  </p>
                </div>

                <InputForm onSubmit={handleSubmit} loading={loading} loadingLabel="Running..." />
              </div>
            </div>

            {/* Results section */}
            <div ref={resultsRef} className="scroll-mt-6">
              {loading && (
                <div className="flex flex-col gap-section">
                  <div className="grid grid-cols-2 gap-default sm:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <MetricCardSkeleton key={i} />
                    ))}
                  </div>
                  <ChartSkeleton />
                  <TableSkeleton rows={3} />
                </div>
              )}

              {error && (
                <Card className="border-negative">
                  <p className="text-body text-negative">{error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setResult(null);
                    }}
                    className="mt-default text-body-sm font-medium text-accent transition-colors duration-300 hover:text-accent-hover"
                  >
                    Try again
                  </button>
                </Card>
              )}

              {result && (
                <div className="flex flex-col gap-default">
                  <SaveResultsBanner
                    show={showBanner}
                    state={bannerState}
                    onDismiss={() => setBannerDismissed(true)}
                    signInButton={
                      <SignInButton mode="modal">
                        <GlowButton size="sm">Sign in to save</GlowButton>
                      </SignInButton>
                    }
                  />
                  <ResultsView result={result} onReRun={handleSubmit} loading={loading} />
                </div>
              )}
            </div>
          </div>
        </main>
        <PageFooter />
      </MethodologyLayout>
    </MethodologyProvider>
  );
}
