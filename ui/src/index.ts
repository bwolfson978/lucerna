// Display-only components: plain data and callbacks in, no app context, data
// fetching, analytics or framework imports. Safe to render in the web app and inside
// MCP App Views.
export { cn } from "./cn";
export { BRACKET_COLORS, CHART_COLORS, PALETTE } from "./colors";
export {
  formatAxisCurrency,
  formatCompactCurrency,
  formatCurrency,
  formatSavings,
  formatTableCurrency,
} from "./format";
export { FILING_STATUS_OPTIONS, STATE_OPTIONS, filingStatusLabel, stateName } from "./options";
export { usePrefersReducedMotion } from "./charts/primitives";
export { useContainerWidth, useScrollFade, useViewportHeight } from "./charts/hooks";
export { Stat } from "./Stat";
export { ConversionStrip, type ConversionYear } from "./ConversionStrip";
export { MetricCard } from "./MetricCard";
export {
  ResultCard,
  isResultCardData,
  isResultDetails,
  type ResultCardData,
  type ResultDetails,
} from "./ResultCard";
export {
  BracketChart,
  type BracketChartLayout,
  type BracketChartYear,
  type TaxBracket,
} from "./BracketChart";
export { BracketFillChart, isBracketFillData, type BracketFillData } from "./BracketFillChart";
export { BalanceComparison, BalanceLines, type BalanceComparisonData } from "./BalanceComparison";
export {
  CompareBars,
  ScenarioCompareCard,
  isScenarioCompareData,
  type ScenarioCompareData,
} from "./ScenarioCompareCard";
export {
  FIELD_LABELS,
  ScenarioSummary,
  isScenarioSummaryData,
  type FilingStatus,
  type ScenarioSummaryData,
  type ScenarioValues,
} from "./ScenarioSummary";
export { RUN_MESSAGE, applyWhatIfMessage } from "./messages";
export { Steps, type Step } from "./Steps";
