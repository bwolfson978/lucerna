"use client";

import { useState, useRef, useEffect } from "react";
import posthog from "posthog-js";
import { Header } from "@/components/common/Header";
import { InputForm } from "@/components/calculator/InputForm";
import { ResultsView } from "@/components/results/ResultsView";
import { MetricCardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/common/Skeleton";
import { apiClient } from "@/lib/api/client";
import type { ScenarioInput, OptimizationResult } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { MethodologyLayout } from "@/components/methodology/MethodologyLayout";

export default function CalculatorPage() {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll to results when loading starts
  useEffect(() => {
    if (loading && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading]);

  async function handleSubmit(input: ScenarioInput) {
    setLoading(true);
    setError(null);
    setResult(null);

    posthog.capture("scenario_submitted", {
      filing_status: input.filing_status,
      num_years: input.timeline?.length ?? 1,
      has_life_events: input.timeline?.some((y) => y.notes && y.notes.trim() !== "") ?? false,
    });

    try {
      const data = await apiClient.optimize(input as unknown as Record<string, unknown>);
      setResult(data as OptimizationResult);
      posthog.capture("scenario_completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setLoading(false);
    }
  }

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
                <div className="flex flex-col gap-1">
                  <h1 className="font-serif text-h1 text-text-primary">Run your scenario</h1>
                  <p className="text-body-sm leading-relaxed text-text-secondary">
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

              {result && <ResultsView result={result} onReRun={handleSubmit} loading={loading} />}
            </div>
          </div>
        </main>
      </MethodologyLayout>
    </MethodologyProvider>
  );
}
