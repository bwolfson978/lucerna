import type { ScenarioComparison } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatCompactCurrency, formatSavings } from "@/lib/utils/formatting";
import { Tooltip } from "@/components/common/Tooltip";

interface ScenarioCardsProps {
  scenarios: ScenarioComparison[];
}

/**
 * Reorder scenarios: No conversion → Full conversion → Highest savings (last).
 * The "best" scenario (difference_from_optimal === 0) always goes last so the
 * multi-year schedule card anchors the bottom of the stack on mobile.
 */
function reorderScenarios(scenarios: ScenarioComparison[]): ScenarioComparison[] {
  const best = scenarios.find((s) => s.difference_from_optimal === 0);
  const rest = scenarios.filter((s) => s.difference_from_optimal !== 0);
  return best ? [...rest, best] : scenarios;
}

export function ScenarioCards({ scenarios }: ScenarioCardsProps) {
  if (!scenarios || scenarios.length === 0) return null;

  const ordered = reorderScenarios(scenarios);

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">Scenario comparison</h3>
        <Tooltip content="Compare different conversion schedules to see how they affect your estimated lifetime tax savings." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-default">
        {ordered.map((scenario) => {
          const isBest = scenario.difference_from_optimal === 0;

          // Replace "Optimal conversion" from older backends
          const label = /optimal/i.test(scenario.label)
            ? "Highest estimated savings"
            : scenario.label;

          // Only show per-year schedule when backend provides it and
          // there are multiple non-zero conversion years
          const scheduleRows =
            scenario.yearly_conversions && scenario.years
              ? scenario.yearly_conversions
                  .map((amount, i) => ({
                    year: scenario.years![i] ?? i,
                    amount,
                  }))
                  .filter((r) => r.amount > 0)
              : [];

          const hasSavings =
            scenario.estimated_savings != null &&
            !Number.isNaN(scenario.estimated_savings);

          return (
            <Card
              key={scenario.label}
              recommended={isBest}
              className="flex flex-col gap-3"
            >
              <span className="text-h3 text-text-primary">{label}</span>

              <div className="flex flex-col gap-2">
                {/* Estimated savings */}
                {hasSavings && (
                  <div className="flex justify-between text-body-sm">
                    <span className="text-text-secondary">
                      Estimated savings
                    </span>
                    <span className={`font-mono font-medium ${scenario.estimated_savings! > 0 ? "text-optimal" : "text-text-primary"}`}>
                      {formatSavings(Math.round(scenario.estimated_savings!))}
                    </span>
                  </div>
                )}

                {/* Per-year conversion schedule (multi-year best scenario) */}
                {scheduleRows.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-border">
                    <span className="text-[11px] text-text-tertiary uppercase tracking-wide">
                      Conversion schedule
                    </span>
                    {scheduleRows.map((row) => (
                      <div
                        key={row.year}
                        className="flex justify-between text-body-sm"
                      >
                        <span className="text-text-secondary">{row.year}</span>
                        <span className="font-mono text-text-primary">
                          {formatCompactCurrency(row.amount)}
                        </span>
                      </div>
                    ))}
                    {scheduleRows.length > 1 && (
                      <div className="flex justify-between text-body-sm pt-1 border-t border-border">
                        <span className="text-text-secondary font-medium">
                          Total
                        </span>
                        <span className="font-mono text-text-primary font-medium">
                          {formatCompactCurrency(scenario.conversion_amount)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Tax on conversions (aggregate) */}
                <div className="flex justify-between text-body-sm">
                  <span className="text-text-secondary">
                    Tax on conversions
                  </span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(scenario.tax_on_conversion)}
                  </span>
                </div>

                {/* Impact on long-term wealth vs best */}
                {scenario.difference_from_optimal !== 0 && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-border">
                    <span className="text-[11px] text-text-tertiary uppercase tracking-wide">
                      Impact on long-term wealth
                    </span>
                    <span
                      className="flex items-center gap-1 text-body-sm text-negative font-medium"
                      style={{ fontFamily: "'Manrope', system-ui" }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 2v8M6 10l-3-3M6 10l3-3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {formatCurrency(Math.abs(scenario.difference_from_optimal))} less than scenario with highest savings
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
