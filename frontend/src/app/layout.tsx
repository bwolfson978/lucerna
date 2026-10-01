import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaxConfigProvider } from "@/lib/tax/TaxConfigProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lucerna | Model. Optimize. Convert.",
  description:
    "Roth conversion planning. Find the low-tax window before required minimum distributions begin and build a year-by-year conversion schedule.",
  openGraph: {
    title: "Lucerna | Model. Optimize. Convert.",
    description:
      "Roth conversion planning. Find the low-tax window before required minimum distributions begin and build a year-by-year conversion schedule.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
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
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </TaxConfigProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
