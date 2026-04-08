import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaxConfigProvider } from "@/lib/tax/TaxConfigProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lucerna — See your financial future clearly",
  description:
    "Multi-year Roth conversion analysis. Compare conversion schedules across your income timeline.",
  openGraph: {
    title: "Lucerna — See your financial future clearly",
    description:
      "Multi-year Roth conversion analysis. Compare conversion schedules across your income timeline.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=Inter:wght@400;500;600&family=Manrope:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <TaxConfigProvider>
          <TooltipProvider delayDuration={300}>
            {children}
          </TooltipProvider>
        </TaxConfigProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
