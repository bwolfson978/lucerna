import type { ScenarioComparison } from "@/lib/types";
import { Card } from "@/components/common/Card";
import { formatCurrency, formatPercent } from "@/lib/utils/formatting";
import { Tooltip } from "@/components/common/Tooltip";

interface ScenarioCardsProps {
  scenarios: ScenarioComparison[];
}

export function ScenarioCards({ scenarios }: ScenarioCardsProps) {
  if (!scenarios || scenarios.length === 0) return null;

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">Scenario comparison</h3>
        <Tooltip content="Compare the optimal conversion schedule against doing nothing or converting everything at once." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-default">
        {scenarios.map((scenario) => {
          const isOptimal = scenario.difference_from_optimal === 0;
          return (
            <Card
              key={scenario.label}
              recommended={isOptimal}
              className="flex flex-col gap-3"
            >
              <span className="text-h3 text-text-primary">
                {scenario.label}
              </span>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-body-sm">
                  <span className="text-text-secondary">
                    Total conversion
                  </span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(scenario.conversion_amount)}
                  </span>
                </div>

                <div className="flex justify-between text-body-sm">
                  <span className="text-text-secondary">
                    Tax on conversions
                  </span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(scenario.tax_on_conversion)}
                  </span>
                </div>

                {scenario.difference_from_optimal !== 0 && (
                  <div className="flex justify-between text-body-sm pt-1 border-t border-border">
                    <span className="text-text-secondary">
                      vs. optimal
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
