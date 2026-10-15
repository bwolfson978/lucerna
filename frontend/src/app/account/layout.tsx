import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Account settings | Roth Conversions Optimizer",
  robots: { index: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
