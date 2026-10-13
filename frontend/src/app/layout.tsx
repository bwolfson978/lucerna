import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaxConfigProvider } from "@/lib/tax/TaxConfigProvider";
import { PostHogIdentifier } from "@/components/providers/PostHogIdentifier";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roth Conversions Optimizer | Model. Optimize. Convert.",
  description:
    "Roth conversion planning. Find the low-tax window before required minimum distributions begin and build a year-by-year conversion schedule.",
  openGraph: {
    title: "Roth Conversions Optimizer | Model. Optimize. Convert.",
    description:
      "Roth conversion planning. Find the low-tax window before required minimum distributions begin and build a year-by-year conversion schedule.",
    type: "website",
  },
  // Bracket-steps mark. Sources live in frontend/public; logo.svg is the large version.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Paper & Pine (docs/design-aesthetic.md) for Clerk's sign-in modal.
const clerkAppearance = {
  variables: {
    colorPrimary: "#1b4332",
    colorBackground: "#ffffff",
    colorText: "#141414",
    colorTextSecondary: "#3d3d3d",
    colorInputBackground: "#ffffff",
    colorInputText: "#141414",
    colorNeutral: "#6b6b6b",
    colorDanger: "#c2410c",
    borderRadius: "10px",
    fontFamily: "Inter, sans-serif",
  },
  elements: {
    // Clerk's default social button is grey text on white; give it a warm paper fill,
    // an emphasis border and ink text so it reads as a real choice next to Continue.
    socialButtonsBlockButton: {
      backgroundColor: "hsl(var(--background-alt))",
      border: "1px solid hsl(var(--border-emphasis))",
      boxShadow: "none",
      "&:hover": { backgroundColor: "hsl(var(--background-hover))" },
    },
    socialButtonsBlockButtonText: {
      color: "hsl(var(--foreground))",
      fontWeight: 500,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const page = (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <TaxConfigProvider>
          <TooltipProvider delayDuration={300}>
            <PostHogIdentifier />
            {children}
          </TooltipProvider>
        </TaxConfigProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
  // Without Clerk keys the app runs signed out (see lib/auth.tsx).
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return page;
  return <ClerkProvider appearance={clerkAppearance}>{page}</ClerkProvider>;
}
