"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/common/Header";
import { ResultsView } from "@/components/results/ResultsView";
import {
  MetricCardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/common/Skeleton";
import { apiClient } from "@/lib/api/client";
import { LIFE_EVENT_LABELS } from "@/lib/utils/constants";
import { formatCurrency } from "@/lib/utils/formatting";
import type { DemoResponse } from "@/lib/types";

export default function DemoPage() {
  const [demo, setDemo] = useState<DemoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .getDemo()
      .then((data) => setDemo(data as DemoResponse))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Extract notable years (non-"none" life events) from trajectory
  const trajectory = demo?.result?.input?.income_trajectory;
  const notableYears = trajectory?.filter((yi) => yi.life_event !== "none") ?? [];
  const totalYears = trajectory?.length ?? 0;
  const retirementAge = demo?.result?.input?.retirement_age ?? 65;

  return (
    <>
      <Header />
      <main className="px-section md:px-page py-section-lg">
        <div className="max-w-content mx-auto flex flex-col gap-section">
          {/* Persona intro */}
          <div className="flex flex-col gap-comfortable">
            <h1 className="text-h1 text-text-primary">Meet Alex</h1>

            <div className="card bg-bg-alt">
              <div className="flex flex-col gap-default">
                <p className="text-body text-text-primary leading-relaxed">
                  <strong>Alex, 38</strong> — Senior Software Engineer who left
                  a $145K/year role 6 months ago to co-found a startup.
                </p>
                <p className="text-body text-text-secondary leading-relaxed">
                  Alex has a $210,000 traditional IRA (rolled over from 14 years
                  of 401k contributions) and is filing single. With two
                  low-income years ahead, there&apos;s a rare window to convert at
                  the 10-22% brackets instead of the usual 24%.
                </p>

                <div className="mt-tight">
                  <h3 className="text-h3 text-text-primary mb-default">
                    Key income milestones
                  </h3>
                  <div className="flex flex-col gap-2 text-body-sm">
                    {notableYears.map((yi) => (
                      <div key={yi.year} className="flex gap-3">
                        <span className="font-mono text-text-secondary w-12">
                          {yi.year}
                        </span>
                        <span className="font-mono w-16">
                          {formatCurrency(yi.gross_income)}
                        </span>
                        <span className="text-text-tertiary">
                          {LIFE_EVENT_LABELS[yi.life_event]}
                        </span>
                      </div>
                    ))}
                    {totalYears > notableYears.length && (
                      <p className="text-text-tertiary text-[11px] mt-1">
                        {totalYears} years modeled through retirement at age{" "}
                        {retirementAge}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
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
            <div className="card border-negative">
              <p className="text-body text-negative">
                Failed to load demo results: {error}
              </p>
              <p className="text-body-sm text-text-secondary mt-default">
                Make sure the backend is running on localhost:8000.
              </p>
            </div>
          )}

          {demo && <ResultsView result={demo.result} />}

          {/* CTA */}
          <div className="flex items-center gap-3 pt-section border-t border-border">
            <Link
              href="/calculator"
              className="inline-flex items-center justify-center h-10 min-h-[44px] px-6 rounded-md bg-accent text-white text-body font-medium shadow-card hover:bg-accent-hover hover:shadow-card-hover active:scale-[0.98] transition-all duration-150"
            >
              Run your own scenario
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
