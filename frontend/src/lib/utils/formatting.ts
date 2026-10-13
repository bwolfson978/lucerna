import {
  formatAxisCurrency,
  formatCompactCurrency,
  formatCurrency,
  formatSavings,
  formatTableCurrency,
} from "@lucerna/ui";

// The basic money formats are shared with MCP App Views (ui/src/format.ts).
export {
  formatAxisCurrency,
  formatCompactCurrency,
  formatCurrency,
  formatSavings,
  formatTableCurrency,
};

export function formatPercent(decimal: number): string {
  return `${Math.round(decimal * 100)}%`;
}

export function formatAge(age: number): string {
  return `Age ${age}`;
}
