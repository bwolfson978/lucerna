import type { ReactNode } from "react";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";

// Shared shell for the plain reading pages: privacy, terms, support and connector setup.
export function DocPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <article className="mx-auto flex max-w-[720px] flex-col gap-section">
          <header className="flex flex-col gap-3">
            <h1 className="display-heading text-display">{title}</h1>
            {updated && (
              <p className="font-mono text-caption text-text-tertiary">Last updated {updated}</p>
            )}
            {intro && <p className="text-body leading-relaxed text-text-secondary">{intro}</p>}
          </header>
          {children}
        </article>
      </main>
      <PageFooter />
    </>
  );
}

export function DocSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="font-serif text-h1 text-text-primary">{title}</h2>
      <div className="flex flex-col gap-3 text-body leading-relaxed text-text-secondary [&_a]:text-pine [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-text-primary [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** A paragraph that opens with a bold lead-in, e.g. "Saved scenarios. We store...". */
export function DocTerm({ term, children }: { term: string; children: ReactNode }) {
  return (
    <p>
      <strong>{term}</strong> {children}
    </p>
  );
}
