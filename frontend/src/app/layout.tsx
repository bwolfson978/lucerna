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
};

const clerkAppearance = {
  variables: {
    colorPrimary: "#2D5016",
    colorBackground: "#FAFAF7",
    colorText: "#1C1C1A",
    colorTextSecondary: "#6B6B65",
    colorInputBackground: "#FFFFFF",
    colorInputText: "#1C1C1A",
    colorNeutral: "#6B6B65",
    colorDanger: "#B91C1C",
    borderRadius: "4px",
    fontFamily: "Inter, sans-serif",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
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
    </ClerkProvider>
  );
}
