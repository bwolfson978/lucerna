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

export default function CalculatorPage() {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Scroll to results when they appear (including loading skeleton)
  useEffect(() => {
    if ((result || error || loading) && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result, error, loading]);

  async function handleSubmit(input: ScenarioInput) {
    setLoading(true);
    setError(null);
    setResult(null);

    posthog.capture("scenario_submitted", {
      filing_status: input.filing_status,
      num_years: input.income_trajectory?.length ?? 1,
      has_life_events: input.income_trajectory?.some(y => y.life_event !== "none") ?? false,
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
    <>
      <Header />
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

              <InputForm onSubmit={handleSubmit} loading={loading} />
            </div>
          </div>

          {/* Results section */}
          <div ref={resultsRef}>
            {loading && (
              <div className="flex flex-col gap-section">
                <div className="flex items-center gap-3">
                  <svg
                    className="animate-spin h-5 w-5 text-accent"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="text-body text-text-secondary">
                    Running optimizer...
                  </span>
                </div>
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
    </>
  );
}
