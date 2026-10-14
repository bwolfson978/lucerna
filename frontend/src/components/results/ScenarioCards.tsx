import type { ScenarioComparison } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { formatCompactCurrency, formatCurrency, formatSavings } from "@/lib/utils/formatting";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";
import { cn } from "@/lib/utils";

interface ScenarioCardsProps {
  scenarios: ScenarioComparison[];
}

/** Highest savings first, then full conversion, then no conversion (best to worst). */
function reorderScenarios(scenarios: ScenarioComparison[]): ScenarioComparison[] {
  return [...scenarios].sort((a, b) => (b.estimated_savings ?? 0) - (a.estimated_savings ?? 0));
}

function ScenarioRow({ scenario }: { scenario: ScenarioComparison }) {
  const isBest = scenario.difference_from_optimal === 0;
  const label = /optimal/i.test(scenario.label) ? "Highest estimated savings" : scenario.label;
  const hasSavings =
    scenario.estimated_savings != null && !Number.isNaN(scenario.estimated_savings);

  return (
    <li className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn("text-body-sm font-semibold", isBest ? "text-pine" : "text-text-primary")}
        >
          {label}
        </span>
        <span className="font-data text-caption text-text-tertiary">
          Convert {formatCompactCurrency(scenario.conversion_amount)} · Tax{" "}
          {formatCompactCurrency(scenario.tax_on_conversion)}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        {hasSavings && (
          <span
            className={cn(
              "font-data text-[17px] font-semibold",
              scenario.estimated_savings! > 0 ? "text-optimal" : "text-text-primary"
            )}
          >
            {formatSavings(Math.round(scenario.estimated_savings!))}
          </span>
        )}
        {!isBest && scenario.difference_from_optimal !== 0 && (
          <span className="font-data whitespace-nowrap text-caption text-negative">
            &minus;{formatCurrency(Math.abs(scenario.difference_from_optimal))}
            <span className="hidden sm:inline"> vs. highest</span>
          </span>
        )}
      </div>
    </li>
  );
}

/** The strategies the optimizer weighed, ranked by estimated lifetime tax savings. */
export function ScenarioCards({ scenarios }: ScenarioCardsProps) {
  if (!scenarios || scenarios.length === 0) return null;

  const ordered = reorderScenarios(scenarios);
  const showSavings = ordered.some((s) => s.estimated_savings != null);

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-text-primary">Compare strategies</h3>
        <InfoTrigger
          label="Why is full conversion worse?"
          sectionId="conversion-tradeoff"
          triggerId="scenario-cards"
          className="shrink-0"
        />
      </div>
      <Card className="flex flex-col gap-3">
        {showSavings && (
          <div className="flex justify-end border-b border-border pb-2 text-caption text-text-tertiary">
            Estimated savings
          </div>
        )}
        <ul className="flex flex-col divide-y divide-border" data-testid="scenario-list">
          {ordered.map((scenario) => (
            <ScenarioRow key={scenario.label} scenario={scenario} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
