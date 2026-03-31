"use client";

import { useState } from "react";
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

  async function handleSubmit(input: ScenarioInput) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await apiClient.optimize(
        input as unknown as Record<string, unknown>
      );
      setResult(data as OptimizationResult);
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
      <main className="px-section md:px-page py-section-lg">
        <div className="max-w-content mx-auto flex flex-col gap-section">
          <div className="flex flex-col gap-default">
            <h1 className="text-h1 text-text-primary">
              Run your scenario
            </h1>
            <p className="text-body text-text-secondary leading-relaxed">
              Enter your details and the optimizer will find the conversion
              schedule that maximizes your after-tax wealth. You can
              fine-tune individual years in the results.
            </p>
          </div>

          {!result && !loading && (
            <InputForm onSubmit={handleSubmit} loading={loading} />
          )}

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
                className="text-body-sm text-accent hover:text-accent-hover font-medium mt-default transition-colors duration-150"
              >
                Try again
              </button>
            </Card>
          )}

          {result && (
            <>
              <ResultsView
                result={result}
                onReRun={handleSubmit}
                loading={loading}
              />
              <div className="flex items-center gap-3 pt-section border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setError(null);
                  }}
                  className="inline-flex items-center justify-center h-10 min-h-[44px] px-6 rounded-md bg-transparent border border-border-emphasis text-text-primary text-body font-medium hover:bg-bg-hover transition-all duration-150"
                >
                  Run another scenario
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
