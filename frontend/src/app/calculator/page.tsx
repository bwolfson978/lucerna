"use client";

import { useState, useRef, useEffect } from "react";
import posthog from "posthog-js";
import { Header } from "@/components/common/Header";
import { InputForm } from "@/components/calculator/InputForm";
import { ResultsView } from "@/components/results/ResultsView";
import {
  MetricCardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/common/Skeleton";
import { apiClient } from "@/lib/api/client";
import type { ScenarioInput, OptimizationResult } from "@/lib/types";
import { Card } from "@/components/ui/card";
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
      num_years: input.income_timeline?.length ?? 1,
      has_life_events: input.income_timeline?.some(y => y.notes && y.notes.trim() !== "") ?? false,
    });

    try {
      const data = await apiClient.optimize(
        input as unknown as Record<string, unknown>
      );
      setResult(data as OptimizationResult);
      posthog.capture("scenario_completed");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Optimization failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <MethodologyProvider>
      <Header />
      <MethodologyLayout result={result ?? undefined}>
        <main className="px-default md:px-page py-section-lg">
          <div className="max-w-content mx-auto flex flex-col gap-section">
            {/* Form section */}
            <div className={`pb-section -mx-default md:-mx-page px-default md:px-page pt-section border-b border-border${!result && !loading && !error ? "" : " shadow-sm"}`}>
              <div className="max-w-content mx-auto flex flex-col gap-default">
                <div className="flex flex-col gap-1">
                  <h1 className="text-h1 text-text-primary font-serif">
                    Run your scenario
                  </h1>
                  <p className="text-body-sm text-text-secondary leading-relaxed">
                    Enter your details and the optimizer will find the conversion
                    schedule that maximizes your after-tax wealth.
                  </p>
                </div>

                <InputForm onSubmit={handleSubmit} loading={loading} loadingLabel="Running..." />
              </div>
            </div>

            {/* Results section */}
            <div ref={resultsRef} className="scroll-mt-6">
              {loading && (
                <div className="flex flex-col gap-section">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-default">
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
                    className="text-body-sm text-accent hover:text-accent-hover font-medium mt-default transition-colors duration-300"
                  >
                    Try again
                  </button>
                </Card>
              )}

              {result && (
                <ResultsView
                  result={result}
                  onReRun={handleSubmit}
                  loading={loading}
                />
              )}
            </div>
          </div>
        </main>
      </MethodologyLayout>
    </MethodologyProvider>
  );
}
