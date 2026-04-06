"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { Header } from "@/components/common/Header";
import { ResultsView } from "@/components/results/ResultsView";
import {
  MetricCardSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/common/Skeleton";
import { apiClient } from "@/lib/api/client";
import { IncomeMilestonesTable } from "@/components/demo/IncomeMilestonesTable";
import type { DemoResponse } from "@/lib/types";
import { Card } from "@/components/ui/card";

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

  const timeline = demo?.result?.input?.income_timeline;
  const retirementAge = demo?.result?.input?.retirement_age ?? 65;

  return (
    <>
      <Header />
      <main className="px-section md:px-page py-section-lg">
        <div className="max-w-content mx-auto flex flex-col gap-section">
          {/* Persona intro */}
          <div className="flex flex-col gap-comfortable">
            <h1 className="text-h1 text-text-primary font-serif">Meet Alex</h1>

            <Card className="bg-bg-alt">
              <div className="flex flex-col gap-default">
                <p className="text-body text-text-primary leading-relaxed">
                  <strong>Alex, 38</strong> — Senior Software Engineer who left
                  a $145K/year role 6 months ago to co-found a startup.
                </p>
                <p className="text-body text-text-secondary leading-relaxed">
                  Alex has a $210,000 traditional IRA/401(k) (rolled over from 14 years
                  of 401k contributions) and is filing single. With two
                  low-income years ahead, there&apos;s a rare window to convert at
                  the 10-22% brackets instead of the usual 24%.
                </p>

                <div className="mt-tight">
                  <h3 className="text-h3 text-text-primary mb-default">
                    Key income milestones
                  </h3>
                  <p className="text-text-tertiary text-[11px] mb-2">
                    {timeline?.length ?? 0} years modeled through retirement
                    at age {retirementAge}
                  </p>
                  {timeline && timeline.length > 0 && (
                    <IncomeMilestonesTable timeline={timeline} />
                  )}
                </div>
              </div>
            </Card>
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
            <Card className="border-negative">
              <p className="text-body text-negative">
                Failed to load demo results: {error}
              </p>
              <p className="text-body-sm text-text-secondary mt-default">
                Make sure the backend is running on localhost:8000.
              </p>
            </Card>
          )}

          {demo && <ResultsView result={demo.result} />}

          {/* CTA */}
          <div className="flex items-center gap-3 pt-section border-t border-border">
            <Link
              href="/calculator"
              onClick={() => posthog.capture("cta_clicked", { cta: "run_your_own_scenario", source: "demo_page" })}
              className="glow-button inline-flex items-center justify-center min-h-[44px] py-3.5 px-8 rounded-[12px] text-bg text-[15px] font-semibold tracking-[0.3px] active:scale-[0.98] transition-all duration-300"
            >
              Run your own scenario
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
