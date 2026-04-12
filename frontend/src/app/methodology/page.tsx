import type { Metadata } from "next";
import { MethodologyPageClient } from "./MethodologyPageClient";

export const metadata: Metadata = {
  title: "Methodology | Lucerna",
  description:
    "A transparent look at the math behind Lucerna's Roth conversion analysis. Learn how our optimization engine finds the conversion schedule that maximizes your after-tax wealth.",
  openGraph: {
    title: "Methodology | Lucerna",
    description:
      "A transparent look at the math behind Lucerna's Roth conversion analysis.",
    type: "website",
  },
};

export default function MethodologyPage() {
  return <MethodologyPageClient />;
}
