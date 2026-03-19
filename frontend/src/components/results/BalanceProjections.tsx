import { MetricCard } from "@/components/common/MetricCard";
import { formatCurrency } from "@/lib/utils/formatting";
import { Tooltip } from "@/components/common/Tooltip";

interface BalanceProjectionsProps {
  traditionalAtRetirement: number;
  rothAtRetirement: number;
  npvAtOptimal: number;
  npvAtZero: number;
}

export function BalanceProjections({
  traditionalAtRetirement,
  rothAtRetirement,
  npvAtOptimal,
  npvAtZero,
}: BalanceProjectionsProps) {
  const totalAtRetirement = traditionalAtRetirement + rothAtRetirement;
  const wealthGain = npvAtOptimal - npvAtZero;

  return (
    <div className="flex flex-col gap-default">
      <div className="flex items-center gap-2">
        <h3 className="text-h3 text-text-primary">
          Projected balances at retirement
        </h3>
        <Tooltip content="Projected account balances at your retirement age, assuming the optimal conversion schedule and expected growth rate." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-default">
        <MetricCard
          label="Traditional IRA"
          value={formatCurrency(traditionalAtRetirement)}
        />
        <MetricCard
          label="Roth IRA"
          value={formatCurrency(rothAtRetirement)}
        />
        <MetricCard
          label="Total at retirement"
          value={formatCurrency(totalAtRetirement)}
        />
        <MetricCard
          label="Impact on after-tax wealth"
          value={formatCurrency(wealthGain)}
          delta={wealthGain > 0 ? "vs. no conversion" : undefined}
          deltaType={wealthGain > 0 ? "positive" : "neutral"}
        />
      </div>
    </div>
  );
}
