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
                    Income trajectory
                  </h3>
                  <div className="flex flex-col gap-2 text-body-sm">
                    <div className="flex gap-3">
                      <span className="font-mono text-text-secondary w-12">
                        2026
                      </span>
                      <span className="font-mono">$35K</span>
                      <span className="text-text-tertiary">
                        Startup year 1
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-mono text-text-secondary w-12">
                        2027
                      </span>
                      <span className="font-mono">$30K</span>
                      <span className="text-text-tertiary">
                        Startup year 2
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-mono text-text-secondary w-12">
                        2028
                      </span>
                      <span className="font-mono">$150K</span>
                      <span className="text-text-tertiary">
                        Back to work
                      </span>
                    </div>
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
