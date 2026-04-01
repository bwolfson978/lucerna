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
  if (abs >= 100_000) {
    const k = Math.round(amount / 1000);
    return `$${k.toLocaleString()}K`;
  }
  return currencyFormatter.format(amount);
}

export function formatPercent(decimal: number): string {
  return `${Math.round(decimal * 100)}%`;
}

export function formatAge(age: number): string {
  return `Age ${age}`;
}
