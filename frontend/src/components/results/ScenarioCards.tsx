import type { ScenarioComparison } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatCompactCurrency } from "@/lib/utils/formatting";
import { Tooltip } from "@/components/common/Tooltip";

interface ScenarioCardsProps {
  scenarios: ScenarioComparison[];
}

export function ScenarioCards({ scenarios }: ScenarioCardsProps) {
  if (!scenarios || scenarios.length === 0) return null;

  // The scenario with difference_from_optimal === 0 gets the highlight
  const bestIdx = scenarios.findIndex((s) => s.difference_from_optimal === 0);

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">Scenario comparison</h3>
        <Tooltip content="Compare different conversion schedules to see how they affect your estimated lifetime tax savings." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-default">
        {scenarios.map((scenario, i) => {
          const isBest = i === bestIdx;
          return (
            <Card
              key={scenario.label}
              recommended={isBest}
              className="flex flex-col gap-3"
            >
              <span className="text-h3 text-text-primary">
                {scenario.label}
              </span>

              <div className="flex flex-col gap-2">
                {/* Estimated savings */}
                <div className="flex justify-between text-body-sm">
                  <span className="text-text-secondary">
                    Estimated savings
                  </span>
                  <span className="font-mono text-text-primary font-medium">
                    {formatCurrency(scenario.estimated_savings ?? 0)}
                  </span>
                </div>

                {/* Per-year conversion schedule */}
                {scenario.yearly_conversions &&
                  scenario.yearly_conversions.length > 0 && (
                    <div className="flex flex-col gap-1 pt-1 border-t border-border">
                      <span className="text-[11px] text-text-tertiary uppercase tracking-wide">
                        Conversion schedule
                      </span>
                      {scenario.yearly_conversions.map((amount, yi) => {
                        const year =
                          scenario.years && scenario.years[yi]
                            ? scenario.years[yi]
                            : yi;
                        return (
                          <div
                            key={year}
                            className="flex justify-between text-body-sm"
                          >
                            <span className="text-text-secondary">{year}</span>
                            <span className="font-mono text-text-primary">
                              {formatCompactCurrency(amount)}
                            </span>
                          </div>
                        );
                      })}
                      {/* Total */}
                      <div className="flex justify-between text-body-sm pt-1 border-t border-border">
                        <span className="text-text-secondary font-medium">
                          Total
                        </span>
                        <span className="font-mono text-text-primary font-medium">
                          {formatCompactCurrency(scenario.conversion_amount)}
                        </span>
                      </div>
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

                {/* Difference from best */}
                {scenario.difference_from_optimal !== 0 && (
                  <div className="flex justify-between text-body-sm pt-1 border-t border-border">
                    <span className="text-text-secondary">
                      Difference
                    </span>
                    <span className="font-mono text-negative">
                      {formatCurrency(scenario.difference_from_optimal)}
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
