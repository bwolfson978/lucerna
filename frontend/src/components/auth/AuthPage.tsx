import type { ReactNode } from "react";
import { Header } from "@/components/common/Header";
import { PageFooter } from "@/components/common/PageFooter";
import { accountsEnabled } from "./AuthProvider";

/** Frame for Clerk's sign-in and sign-up screens. Clerk's OAuth flow (connecting this
 * site to Claude or ChatGPT) also lands here. */
export function AuthPage({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="px-default py-section-lg md:px-page">
        <div className="mx-auto flex max-w-[480px] flex-col items-center gap-section">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="eyebrow-pine block">Your account</span>
            <h1 className="display-heading text-display">{title}</h1>
            <p className="text-body leading-relaxed text-text-secondary">
              Save scenarios and come back to them, here or from Claude.
            </p>
          </div>
          {accountsEnabled() ? (
            children
          ) : (
            <p className="card text-body text-text-secondary">
              Accounts aren&apos;t available right now.
            </p>
          )}
        </div>
      </main>
      <PageFooter />
    </>
  );
}
