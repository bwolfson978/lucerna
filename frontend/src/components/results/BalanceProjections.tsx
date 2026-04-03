import { MetricCard } from "@/components/common/MetricCard";
import { formatCompactCurrency, formatSavings } from "@/lib/utils/formatting";
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
        <Tooltip content="Projected account balances at your retirement age, assuming the selected conversion schedule and expected growth rate." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-default">
        <MetricCard
          label="Traditional IRA/401(k)"
          value={formatCompactCurrency(traditionalAtRetirement)}
        />
        <MetricCard
          label="Roth IRA/401(k)"
          value={formatCompactCurrency(rothAtRetirement)}
        />
        <MetricCard
          label="Total at retirement"
          value={formatCompactCurrency(totalAtRetirement)}
        />
        <MetricCard
          label="Impact on after-tax wealth"
          value={formatSavings(wealthGain)}
          valueClassName={wealthGain > 0 ? "text-optimal" : undefined}
          delta={wealthGain > 0 ? "vs. no conversion" : undefined}
          deltaType="neutral"
        />
      </div>
    </div>
  );
}
