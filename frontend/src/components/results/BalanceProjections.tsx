import { Stat } from "@lucerna/ui";
import { Card } from "@/components/ui/card";
import { formatCompactCurrency } from "@/lib/utils/formatting";
import { InfoTrigger } from "@/components/methodology/InfoTrigger";

interface BalanceProjectionsProps {
  traditionalAtRetirement: number;
  rothAtRetirement: number;
}

/** Projected account balances when withdrawals begin, under the optimized schedule. */
export function BalanceProjections({
  traditionalAtRetirement,
  rothAtRetirement,
}: BalanceProjectionsProps) {
  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-h3 text-text-primary">Projected balances at retirement</h3>
        <InfoTrigger
          label="What assumptions drive these projections?"
          sectionId="assumptions-limitations"
          triggerId="balance-projections"
          className="shrink-0"
        />
      </div>
      <Card className="grid grid-cols-3 gap-3">
        <Stat label="Traditional" value={formatCompactCurrency(traditionalAtRetirement)} />
        <Stat label="Roth" value={formatCompactCurrency(rothAtRetirement)} />
        <Stat
          label="Total"
          value={formatCompactCurrency(traditionalAtRetirement + rothAtRetirement)}
        />
      </Card>
    </div>
  );
}
