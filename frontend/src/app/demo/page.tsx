import type { Metadata } from "next";
import { ScenarioWorkspace } from "@/components/conversation/ScenarioWorkspace";

export const metadata: Metadata = {
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return <ScenarioWorkspace variant="demo" />;
}
