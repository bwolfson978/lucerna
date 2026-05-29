"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { Header } from "@/components/common/Header";
import { ResultsView } from "@/components/results/ResultsView";
import { MetricCardSkeleton, ChartSkeleton, TableSkeleton } from "@/components/common/Skeleton";
import { apiClient } from "@/lib/api/client";
import { IncomeMilestonesTable } from "@/components/demo/IncomeMilestonesTable";
import type { DemoResponse } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { MethodologyProvider } from "@/components/methodology/MethodologyContext";
import { MethodologyLayout } from "@/components/methodology/MethodologyLayout";

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

  const timeline = demo?.result?.input?.timeline;
  const drawdownStartAge = demo?.result?.input?.drawdown_start_age ?? 65;

  return (
    <MethodologyProvider>
      <Header />
      <MethodologyLayout result={demo?.result}>
        <main className="px-default py-section-lg md:px-page">
          <div className="mx-auto flex max-w-content flex-col gap-section">
            {/* Persona intro */}
            <div className="flex flex-col gap-comfortable">
              <h1 className="font-serif text-h1 text-text-primary">Meet Margaret</h1>

              <Card className="bg-bg-alt">
                <div className="flex flex-col gap-default">
                  <p className="text-body leading-relaxed text-text-primary">
                    <strong>Margaret, 63.</strong> Registered nurse who retired last year after a
                    35-year career, living off a taxable brokerage account and cash savings.
                  </p>
                  <p className="text-body leading-relaxed text-text-secondary">
                    She has $1,400,000 in a traditional 401(k) and hasn&apos;t claimed Social
                    Security yet. Taxable income right now is about $20,000 per year, well inside
                    the 12% bracket for married couples. At 73, required minimum distributions on a
                    balance that may exceed $2.7 million will force six-figure taxable income
                    whether she needs it or not. She has 10 years to act.
                  </p>

                  <div className="mt-tight">
                    <h3 className="mb-default text-h3 text-text-primary">Key income milestones</h3>
                    <p className="mb-2 text-caption text-text-tertiary">
                      {timeline?.length ?? 0} years modeled through age {drawdownStartAge}
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
                <p className="text-body text-negative">Failed to load demo results: {error}</p>
                <p className="mt-default text-body-sm text-text-secondary">
                  Make sure the backend is running on localhost:8000.
                </p>
              </Card>
            )}

            {demo && <ResultsView result={demo.result} />}

            {/* CTA */}
            <div className="flex items-center gap-3 border-t border-border pt-section">
              <Link
                href="/calculator"
                onClick={() =>
                  posthog.capture("cta_clicked", {
                    cta: "run_your_own_scenario",
                    source: "demo_page",
                  })
                }
                className="glow-button inline-flex min-h-[44px] items-center justify-center rounded-[12px] px-8 py-3.5 text-[15px] font-semibold tracking-[0.3px] text-bg transition-all duration-300 active:scale-[0.98]"
              >
                Run your own scenario
              </Link>
            </div>
          </div>
        </main>
      </MethodologyLayout>
    </MethodologyProvider>
  );
}
