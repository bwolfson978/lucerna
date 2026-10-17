"use client";

import { useEffect } from "react";
import { InputForm } from "@/components/calculator/InputForm";
import type { ScenarioInput } from "@/lib/types";
import type { ScenarioDraft } from "@/lib/scenario/draft";
import { BackBar } from "./FullResultsView";
import type { DetailsSection } from "./ScenarioPanel";

const SECTION_IDS: Record<DetailsSection, string> = {
  income: "income-in-retirement",
  health: "health-insurance",
  years: "income-by-year",
};

interface ScenarioDetailsViewProps {
  draft: ScenarioDraft;
  onDraftChange: (draft: ScenarioDraft) => void;
  onSubmit: (input: ScenarioInput) => void;
  onBack: () => void;
  /** Open scrolled to this part of the form. */
  section?: DetailsSection;
  running?: boolean;
}

/**
 * Every value the analysis uses, as a form: the edits the scenario panel can't make in
 * place (income sources, health insurance, single years), opened from the panel.
 */
export function ScenarioDetailsView({
  draft,
  onDraftChange,
  onSubmit,
  onBack,
  section,
  running,
}: ScenarioDetailsViewProps) {
  useEffect(() => {
    const target = section ? document.getElementById(SECTION_IDS[section]) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0 });
  }, [section]);

  return (
    <div className="flex flex-col gap-section">
      <BackBar onBack={onBack} />
      <div className="flex flex-col gap-2">
        <span className="eyebrow-pine">Your scenario</span>
        <h1 className="display-heading text-[clamp(1.8rem,3.6vw,2.6rem)]">
          All <em>the details.</em>
        </h1>
        <p className="max-w-[620px] text-body leading-relaxed text-text-secondary">
          Every value the analysis uses. Changes here update your scenario right away.
        </p>
      </div>
      <InputForm
        draft={draft}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        loading={running}
        loadingLabel="Running..."
        submitLabel="Run the numbers"
      />
    </div>
  );
}
