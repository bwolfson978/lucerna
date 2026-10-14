import type { Metadata } from "next";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { FeedbackPageForm } from "./FeedbackPageForm";

export const metadata: Metadata = {
  title: "Feedback | Roth Conversions Optimizer",
  description: "Share feedback or report a problem with Roth Conversions Optimizer.",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; digest?: string; from?: string }>;
}) {
  const { kind, digest, from } = await searchParams;
  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <div className="mx-auto flex max-w-[640px] flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="eyebrow-pine block">Feedback</span>
            <h1 className="display-heading text-display">
              Tell us what <em>you think.</em>
            </h1>
            <p className="text-body leading-relaxed text-text-secondary">
              Ideas, questions and bug reports all reach the developer directly. You can also send
              them from Claude or ChatGPT: just ask the assistant to send feedback or report a
              problem.
            </p>
          </div>
          <FeedbackPageForm
            initialKind={kind === "problem" ? "problem" : "feedback"}
            errorDigest={digest}
            fromPath={from}
          />
        </div>
      </main>
      <PageFooter />
    </>
  );
}
