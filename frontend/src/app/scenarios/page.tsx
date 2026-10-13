import type { Metadata } from "next";
import { SavedScenariosPage } from "@/components/saved/SavedScenariosPage";

export const metadata: Metadata = {
  title: "My scenarios | Roth Conversions Optimizer",
  robots: { index: false },
};

export default function ScenariosPage() {
  return <SavedScenariosPage />;
}
