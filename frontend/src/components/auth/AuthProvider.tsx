import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { ClerkAccountBridge } from "./ClerkAccountBridge";

/** Clerk's sign-in and account screens in Paper & Pine (docs/design-aesthetic.md). */
export const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#0b1d15",
    colorBackground: "#ffffff",
    colorForeground: "#141414",
    colorMutedForeground: "#6b6b6b",
    colorInput: "#ffffff",
    colorInputForeground: "#141414",
    colorBorder: "#e4e0d6",
    colorDanger: "#c2410c",
    colorNeutral: "#141414",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "10px",
  },
  elements: {
    headerTitle: { fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 600 },
    formButtonPrimary: { borderRadius: "999px", minHeight: "44px", fontWeight: 600 },
    socialButtonsBlockButton: { borderRadius: "999px", minHeight: "44px" },
    card: { boxShadow: "0 24px 60px -34px rgba(27,67,50,0.22)", borderRadius: "20px" },
  },
};

export function accountsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** Accounts when a Clerk key is configured. Without one (local dev, CI, previews), the
 * app runs signed out exactly as before accounts existed. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!accountsEnabled()) return <>{children}</>;
  return (
    <ClerkProvider
      appearance={CLERK_APPEARANCE}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <ClerkAccountBridge>{children}</ClerkAccountBridge>
    </ClerkProvider>
  );
}
