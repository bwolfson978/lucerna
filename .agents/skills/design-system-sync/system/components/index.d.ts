// Paper & Pine components (window.LucernaUI). Types as documentation, taken from
// lucerna@{{sha}}: ui/src (shared cards) and frontend/src/components/ui (web app kit).
import type * as React from "react";

// ── Shared cards (ui/src) ─────────────────────────────────────────────

export interface StatProps {
  label: string;
  value: string;
  /** Colour of the value: ink, pine-mid or destructive. Default "default". */
  tone?: "default" | "positive" | "negative";
  /** A short line under the value, e.g. "across 3 years". */
  note?: string;
}
export declare function Stat(props: StatProps): React.JSX.Element;

export interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  /** Optional info control next to the label (the web app passes its tooltip). */
  info?: React.ReactNode;
  className?: string;
  valueClassName?: string;
}
export declare function MetricCard(props: MetricCardProps): React.JSX.Element;

export interface ConversionYear {
  year: number;
  conversion: number;
}
export interface ConversionStripProps {
  schedule: ConversionYear[];
}
export declare function ConversionStrip(props: ConversionStripProps): React.JSX.Element;

/** A federal bracket in taxable income; `max` is null for the top bracket. */
export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
}
export interface BracketChartYear {
  year: number;
  age?: number;
  /** Income from outside the accounts (wages, pensions), without Social Security. */
  income?: number;
  rmdAmount?: number;
  /** Traditional withdrawal that funds spending, beyond the required one. */
  withdrawal?: number;
  /** The taxed part of Social Security; drawn right under the conversion. */
  socialSecurity?: number;
  conversion?: number;
  /** Deductions at 65 and over on top of the standard one; they come off the bottom of the bar. */
  extraDeduction?: number;
}
/** Where a year's bar ends: everything stacked in it, less the 65+ deductions. */
export declare function barTop(year: BracketChartYear): number;
export interface BracketLegendItem {
  color: string;
  label: string;
  outline?: boolean;
}
/** The legend for these years: the conversion, and each other part some year has. */
export declare function bracketLegend(years: BracketChartYear[]): BracketLegendItem[];
export interface BracketChartLayout {
  leftOffset: number;
  rightOffset: number;
  verticalLabelWidth: number;
  axisLabelStart: number;
}
export interface BracketChartProps {
  years: BracketChartYear[];
  /** Federal brackets for the filing status, in taxable income. */
  brackets: TaxBracket[];
  /** Standard deduction for the filing status, drawn as the 0% band. */
  standardDeduction: number;
  /** Tax the conversion adds each year, shown as the "Tax" row under the bars. */
  addedTax?: (number | null | undefined)[];
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onBarWidthChange?: (barWidth: number) => void;
  onLayoutChange?: (layout: BracketChartLayout) => void;
  /** Hide the built-in series legend (when rendered externally). */
  hideLegend?: boolean;
  /** Fixed Y-scale max so the chart does not rescale as a slider moves. */
  stableMaxGrossAmount?: number;
  /** Keep the minimum desktop height instead of growing with the window (cards, MCP Views). */
  fixedHeight?: boolean;
}
export declare function BracketChart(props: BracketChartProps): React.JSX.Element;

export interface BracketFillData {
  /** `tax` is the engine's tax on that year's conversion (federal and state). */
  years: {
    year: number;
    age: number;
    income: number;
    rmd: number;
    withdrawal?: number;
    taxable_social_security?: number;
    conversion: number;
    extra_deduction?: number;
    tax: number;
  }[];
  brackets: TaxBracket[];
  standard_deduction: number;
}
export interface BracketFillChartProps {
  data: BracketFillData;
  /** Draw its own card with a title. Off when embedded in another card. Default true. */
  framed?: boolean;
  /** Fix the vertical scale (see BracketChart), e.g. while a slider changes the data. */
  stableMaxGrossAmount?: number;
}
export declare function BracketFillChart(props: BracketFillChartProps): React.JSX.Element;
export declare function isBracketFillData(value: unknown): value is BracketFillData;
/** `BracketChart`'s `years` for this data. */
export declare function bracketChartYears(data: BracketFillData): BracketChartYear[];

export interface ResultCardData {
  result_id: string;
  estimated_lifetime_tax_savings_todays_dollars: number;
  total_conversion: number;
  total_tax_on_conversions: number;
  years_with_conversions: number;
  schedule_by_year: ConversionYear[];
}
export interface ResultDetails {
  bracket_fill?: BracketFillData;
  /** Schedules for other totals, for the slider. Absent from older results. */
  curve?: ConversionCurveData;
}
/** Where the slider sits, reported as it moves (e.g. to tell the assistant). */
export interface ResultCardSelection {
  total: number;
  savings: number;
  optimalTotal: number;
  optimalSavings: number;
}
export interface ResultCardProps {
  data: ResultCardData;
  /** With chart series the card shows bracket filling; without, a bar per year.
   * With a curve as well, a slider tries other totals. */
  details?: ResultDetails;
  /** Open the complete analysis. Omit to hide the button. */
  onOpenFullResults?: () => void;
  /** Ask the assistant about the total on the slider. Omit to hide the button. */
  onAsk?: (message: string) => void;
  /** Called when the slider moves. */
  onSelectionChange?: (selection: ResultCardSelection) => void;
}
export declare function ResultCard(props: ResultCardProps): React.JSX.Element;
export declare function isResultCardData(value: unknown): value is ResultCardData;
export declare function isResultDetails(value: unknown): value is ResultDetails;

/** One point of the savings curve: the savings at a total converted. */
export interface SliderSavingsPoint {
  total: number;
  savings: number;
}
export interface ConversionSliderProps {
  value: number;
  /** Default 0. */
  min?: number;
  max: number;
  /** The total with the most savings, marked on the track and snapped to. */
  optimalValue: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Savings at other totals. With them the track deepens to pine where savings are
   * highest; without, it is a plain track filled up to the thumb. */
  savings?: SliderSavingsPoint[];
}
export declare function ConversionSlider(props: ConversionSliderProps): React.JSX.Element;
/** The track's background gradient, or null when there is nothing to show. */
export declare function savingsGlow(points: SliderSavingsPoint[] | undefined, min: number, max: number, optimalValue: number): string | null;

export interface MostSavingsNoteProps {
  /** Whether the amount shown is the one with the most savings. */
  atOptimal: boolean;
  /** How much less the amount shown saves than the most savings. */
  shortfall: number;
  /** Go back to the amount with the most savings. Omit to hide the button. */
  onBack?: () => void;
  /** What the headline number means, said after "Most savings". */
  caption?: string;
}
export declare function MostSavingsNote(props: MostSavingsNoteProps): React.JSX.Element;

/** The conversion curve the slider reads (the analyze tool's View `_meta.curve`):
 * real schedules for a range of total amounts, lowest total first. */
export interface ConversionCurveData {
  points: {
    /** Total converted across all years. */
    total: number;
    /** Estimated lifetime tax savings in today's dollars. */
    savings: number;
    /** Tax on the conversions. */
    tax: number;
    /** Each year's conversion, one per plan year. */
    conversions: number[];
    /** Each year's required withdrawal, which shrinks as more is converted. */
    rmds: number[];
    /** The other parts of each year's bar that change with the amount converted.
     * Absent from older results. */
    withdrawals?: number[];
    taxable_social_security?: number[];
    extra_deductions?: number[];
    /** Each year's tax on its conversion (federal and state). Absent from older results. */
    taxes?: number[];
  }[];
}
export interface CurveSample {
  savings: number;
  tax: number;
  conversions: number[];
  rmds: number[];
  taxes?: number[];
}
export declare function isConversionCurveData(value: unknown): value is ConversionCurveData;
/** The curve at any total: a blend of the two points around it. */
export declare function sampleCurve(curve: ConversionCurveData, total: number): CurveSample;
export declare function federalTax(gross: number, brackets: TaxBracket[], standardDeduction: number): number;

/** Every number a result shows at one total on the slider. */
export interface ResultAtTotal {
  atOptimal: boolean;
  savings: number;
  shortfall: number;
  /** Tax on the conversions (federal and state). */
  taxCost: number;
  /** Years with a conversion. */
  years: number;
  /** The bracket chart's years at this total. Absent without chart data. */
  chart?: BracketFillData;
}
/** A result at any total: the engine's figures at the optimal total, the curve's off it. */
export declare function resultAtTotal(data: ResultCardData, fill: BracketFillData | undefined, curve: ConversionCurveData | undefined, total: number): ResultAtTotal;
/** One vertical scale for every total, so bars move and the chart's axis stays put. */
export declare function stableChartMax(fill: BracketFillData, curve: ConversionCurveData): number;
/** The slider's state and everything shown at its total, for the result card and the full results page. */
export declare function useResultSlider(
  data: ResultCardData,
  details: ResultDetails | undefined,
  onSelectionChange?: (selection: ResultCardSelection) => void
): ResultAtTotal & {
  total: number;
  move: (next: number) => void;
  optimal: number;
  max: number;
  curve: ConversionCurveData | undefined;
  stableMax: number | undefined;
};
export declare function computeSnapThreshold(min: number, max: number, step?: number): number;
export declare function maybeSnap(value: number, optimalValue: number, min: number, max: number, step?: number): number;

export interface TaxBreakdown {
  paid_now: number;
  avoided_later: number;
}
export interface ScenarioCompareData {
  label: string;
  base_result_id: string;
  variant_result_id: string;
  estimated_lifetime_tax_savings: { current: number; what_if: number; difference: number };
  /** Savings = avoided_later - paid_now. Missing from results saved before it existed. */
  tax_breakdown?: { current: TaxBreakdown; what_if: TaxBreakdown };
  conversions_by_year: { year: number; current: number; what_if: number }[];
}
export interface ScenarioCompareCardProps {
  data: ScenarioCompareData;
  /** Open the full analysis of the what-if. Omit to hide the button. */
  onOpenFullResults?: () => void;
  /** Make the what-if the scenario. Omit to hide the button. */
  onApply?: () => void;
  applied?: boolean;
  applyDisabled?: boolean;
}
export declare function ScenarioCompareCard(props: ScenarioCompareCardProps): React.JSX.Element;
export declare function isScenarioCompareData(value: unknown): value is ScenarioCompareData;

export interface PaidVsAvoidedProps {
  rows: { label: string; breakdown: TaxBreakdown; savings: number }[];
}
export declare function PaidVsAvoided(props: PaidVsAvoidedProps): React.JSX.Element | null;

export type FilingStatus = "single" | "married_filing_jointly";
export type IncomeKind = "social_security" | "pension" | "other";
export interface IncomeSource {
  kind: IncomeKind;
  owner: "you" | "spouse";
  label?: string | null;
  /** Yearly amount in dollars. */
  amount: number;
  /** The user's age in the first year. */
  start_age: number;
  /** The user's age in the last year. Null means through the end of the plan. */
  end_age?: number | null;
}
export interface ScenarioValues {
  birth_year?: number | null;
  /** 1 (January) to 12. */
  birth_month?: number | null;
  spouse_birth_year?: number | null;
  spouse_birth_month?: number | null;
  filing_status?: FilingStatus | null;
  state?: string | null;
  retirement_state?: string | null;
  custom_state_rate_pct?: number | null;
  current_income?: number | null;
  current_income_end_age?: number | null;
  income_sources?: IncomeSource[];
  income_growth_rate_pct?: number | null;
  traditional_balance?: number | null;
  roth_balance?: number | null;
  retirement_age?: number | null;
  retirement_spending?: number | null;
  planning_horizon_age?: number | null;
  investment_return_pct?: number | null;
  discount_rate_pct?: number | null;
  inflation_pct?: number | null;
  include_aca?: boolean;
  household_size?: number | null;
  monthly_slcsp_premium?: number | null;
}
export interface ScenarioSummaryData {
  scenario: ScenarioValues;
  timeline: { year: number; gross_income: number; note?: string | null }[];
}
export interface ScenarioSummaryProps {
  data: ScenarioSummaryData;
  /** Short status in the header, such as "Confirmed". */
  badge?: string;
  /** Edit a value inline. Omit for a read-only summary. */
  onEdit?: (patch: Partial<ScenarioValues>) => void;
  /** Open the full form, for values edited there (ACA). */
  onOpenForm?: () => void;
  /** Run the analysis. Omit to hide the footer. */
  onRun?: () => void;
  runDisabled?: boolean;
  /** Footer text next to the Run button. */
  hint?: string;
  /** Required values still missing (field names), listed above the footer. */
  missing?: string[];
  /** Start folded to a one-line recap that opens from the header. */
  collapsible?: boolean;
  /** "card" (default) is a card of its own. "panel" fills a side panel or sheet that has
   * its own heading and Run button: no card frame or header, one column at any width,
   * and values still needed read "Add". */
  variant?: "card" | "panel";
  /** Fields that just changed (filled in by the assistant), marked "New". */
  highlight?: (keyof ScenarioValues)[];
}
export declare function ScenarioSummary(props: ScenarioSummaryProps): React.JSX.Element;
export declare function isScenarioSummaryData(value: unknown): value is ScenarioSummaryData;
/** Labels for the fields `prepare_scenario` reports as missing. */
export declare const FIELD_LABELS: Record<string, string>;

export interface Step {
  title: React.ReactNode;
  /** A short line under the title: years, amounts, an age. */
  meta?: React.ReactNode;
  body?: React.ReactNode;
}
export interface StepsProps {
  steps: Step[];
}
export declare function Steps(props: StepsProps): React.JSX.Element;

// Helpers also on the namespace
export declare function cn(...classes: Array<string | false | null | undefined>): string;
export declare const PALETTE: Record<string, string>;
export declare const CHART_COLORS: Record<string, string>;
export declare const BRACKET_COLORS: Record<string, string>;
export declare function formatCurrency(value: number): string;
export declare function formatCompactCurrency(value: number): string;
export declare function formatSavings(value: number): string;
export declare function formatAxisCurrency(value: number): string;
export declare function formatTableCurrency(value: number): string;

// ── Web app kit (frontend/src/components/ui) ─────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Default "default" (pine-deep pill). */
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  /** Default "default". */
  size?: "default" | "sm" | "lg" | "icon";
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export declare function buttonVariants(opts?: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string }): string;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 2px pine-mid border (.card-recommended). */
  recommended?: boolean;
  /** 2px sage border, "your selection" (.card-current). */
  current?: boolean;
}
export declare const Card: React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>>;
export declare const CardHeader: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement>>;
export declare const CardTitle: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLHeadingElement>>;
export declare const CardDescription: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLParagraphElement>>;
export declare const CardContent: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement>>;
export declare const CardFooter: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement>>;

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Decimal keyboard and tabular figures (.font-data). */
  numeric?: boolean;
}
export declare const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;
export declare const Label: React.ForwardRefExoticComponent<LabelProps & React.RefAttributes<HTMLLabelElement>>;

export interface SelectProps {
  options: { value: string; label: string }[];
  value?: string;
  /** Called with an event-like object so it drops into existing input handlers. */
  onChange?: (e: { target: { value: string } }) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  "aria-required"?: boolean;
  "aria-invalid"?: boolean;
}
export declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLButtonElement>>;

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}
export declare const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLButtonElement>>;

export interface TooltipProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  children?: React.ReactNode;
}
/** Radix Tooltip root. Wrap the app (or a subtree) in TooltipProvider. */
export declare const Tooltip: React.FC<TooltipProps>;
export declare const TooltipProvider: React.FC<{ delayDuration?: number; children?: React.ReactNode }>;
export declare const TooltipTrigger: React.ForwardRefExoticComponent<React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>;
export declare const TooltipContent: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & { side?: "top" | "right" | "bottom" | "left"; sideOffset?: number }>;

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;
export declare function Skeleton(props: SkeletonProps): React.JSX.Element;

export interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}
/** Radix Collapsible root; pair with CollapsibleTrigger and CollapsibleContent. */
export declare const Collapsible: React.ForwardRefExoticComponent<CollapsibleProps>;
export declare const CollapsibleTrigger: React.ForwardRefExoticComponent<React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>;
export declare const CollapsibleContent: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement>>;
