"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Where "Report this problem" goes: the feedback page, with the error and the page. */
export function problemReportHref(digest?: string, from?: string) {
  const params = new URLSearchParams({ kind: "problem" });
  if (digest) params.set("digest", digest);
  if (from) params.set("from", from);
  return `/feedback?${params.toString()}`;
}

/** Shown by the route and root error boundaries in place of a page that failed to render. */
export function ErrorNotice({ onRetry, digest }: { onRetry: () => void; digest?: string }) {
  const from = usePathname() ?? undefined;
  return (
    <main className="px-default py-section-lg md:px-page">
      <div className="card mx-auto flex max-w-[560px] flex-col items-center gap-4 py-12 text-center">
        <h1 className="display-heading text-h1">Something went wrong.</h1>
        <p className="text-body-sm text-text-secondary">
          This page hit an unexpected error. It has been reported, and trying again usually works.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onRetry} className="btn-dark">
            Try again
          </button>
          <Link href="/" className="btn-ghost">
            Back to home
          </Link>
        </div>
        <a
          href={problemReportHref(digest, from)}
          className="text-body-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
        >
          Still broken? Report this problem
        </a>
      </div>
    </main>
  );
}
