import Link from "next/link";

/** Shown by the route and root error boundaries in place of a page that failed to render. */
export function ErrorNotice({ onRetry }: { onRetry: () => void }) {
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
      </div>
    </main>
  );
}
