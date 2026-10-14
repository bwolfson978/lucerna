import type { ReactNode } from "react";

interface SignInRequiredProps {
  title: string;
  description: string;
  /** The sign-in control (Clerk's modal button in the app); hidden when sign-in is off. */
  signInButton: ReactNode;
}

/**
 * Shown in place of account-only content to a visitor who isn't signed in, for
 * example when a link from a chat app opens "My scenarios" in a fresh browser.
 * Signing in through the modal keeps them on the same page.
 */
export function SignInRequired({ title, description, signInButton }: SignInRequiredProps) {
  return (
    <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-body font-medium text-text-primary">{title}</span>
        <span className="text-body-sm text-text-secondary">{description}</span>
      </div>
      <div className="shrink-0">{signInButton}</div>
    </div>
  );
}
