const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    // Use 1 decimal for values like $1.3M, drop decimal if whole like $2M
    const formatted = m % 1 === 0 ? `${m}` : m.toFixed(1);
    return `${sign}$${formatted}M`;
  }
  if (abs >= 100_000) {
    const k = Math.round(abs / 1000);
    return `${sign}$${k.toLocaleString()}K`;
  }
  return currencyFormatter.format(amount);
}

export function formatAxisCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const formatted = m % 1 === 0 ? `${m}` : m.toFixed(1);
    return `${sign}$${formatted}M`;
  }
  if (abs >= 1_000) {
    const k = Math.round(abs / 1000);
    return `${sign}$${k}K`;
  }
  return currencyFormatter.format(amount);
}

export function formatPercent(decimal: number): string {
  return `${Math.round(decimal * 100)}%`;
}

export function formatSavings(amount: number): string {
  const formatted = currencyFormatter.format(Math.abs(amount));
  if (amount > 0) return `+${formatted}`;
  if (amount < 0) return `-${formatted}`;
  return formatted;
}

export function formatAge(age: number): string {
  return `Age ${age}`;
}
