import type { Metadata } from "next";
import { ScenarioWorkspace } from "@/components/conversation/ScenarioWorkspace";

export const metadata: Metadata = {
  alternates: { canonical: "/calculator" },
};

export default function CalculatorPage() {
  return <ScenarioWorkspace variant="calculator" />;
}
