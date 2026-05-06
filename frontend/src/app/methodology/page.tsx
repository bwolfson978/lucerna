import type { Metadata } from "next";
import { MethodologyPageClient } from "./MethodologyPageClient";

export const metadata: Metadata = {
  title: "Methodology | Roth Conversion Optimizer",
  description:
    "A transparent look at the math behind this Roth conversion analysis. Learn how our optimization engine finds the conversion schedule that maximizes your after-tax wealth.",
  openGraph: {
    title: "Methodology | Roth Conversion Optimizer",
    description: "A transparent look at the math behind this Roth conversion analysis.",
    type: "website",
  },
};

export default function MethodologyPage() {
  return <MethodologyPageClient />;
}
