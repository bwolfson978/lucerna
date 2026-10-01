import {
  formatAxisCurrency,
  formatCompactCurrency,
  formatCurrency,
  formatSavings,
} from "@lucerna/ui";

// The basic money formats are shared with MCP App Views (ui/src/format.ts).
export { formatAxisCurrency, formatCompactCurrency, formatCurrency, formatSavings };

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Compact currency format for narrow table cells.
 * Fits within maxChars by progressively dropping decimal precision.
 *
 * Examples at maxChars=6: $0, $800, $12K, $150K, $1.2M
 * Examples at maxChars=7: $0, $800, $11.9K, $150K, $1.2M
 */
export function formatTableCurrency(amount: number, maxChars = 6): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const budget = maxChars - sign.length;

  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    // Try with 2 decimals, then 1, then 0
    const with2 = `$${m.toFixed(2).replace(/\.?0+$/, "")}M`;
    const with1 = `$${m.toFixed(1).replace(/\.0$/, "")}M`;
    const with0 = `$${Math.round(m)}M`;
    if (with2.length <= budget) return `${sign}${with2}`;
    if (with1.length <= budget) return `${sign}${with1}`;
    return `${sign}${with0}`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const with1 = `$${k.toFixed(1).replace(/\.0$/, "")}K`;
    const with0 = `$${Math.round(k)}K`;
    if (with1.length <= budget) return `${sign}${with1}`;
    return `${sign}${with0}`;
  }
  return currencyFormatter.format(amount);
}

export function formatPercent(decimal: number): string {
  return `${Math.round(decimal * 100)}%`;
}

export function formatAge(age: number): string {
  return `Age ${age}`;
}
