import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lucerna — See your financial future clearly",
  description: "Multi-year Roth conversion optimizer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
