// Display-only components: plain data and callbacks in, no app context, data
// fetching, analytics or framework imports. Safe to render in the web app and inside
// MCP App Views.
export { cn } from "./cn";
export { formatCompactCurrency, formatCurrency, formatSavings } from "./format";
export { ConversionStrip, type ConversionYear } from "./ConversionStrip";
export { MetricCard } from "./MetricCard";
export { ResultCard, isResultCardData, type ResultCardData } from "./ResultCard";
