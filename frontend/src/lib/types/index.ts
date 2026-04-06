export type FilingStatus = "single" | "married_filing_jointly";

export type LifeEvent =
  | "none"
  | "grad_school"
  | "sabbatical"
  | "startup"
  | "career_change"
  | "part_time"
  | "early_retirement"
  | "parental_leave"
  | "back_to_work"
  | "layoff";

export interface YearlyIncome {
  year: number;
  gross_income: number;
  life_event: LifeEvent;
  state?: string | null;
}

export interface ConversionPreferences {
  max_annual_tax_cost?: number | null;
  min_conversion_years?: number | null;
  max_conversion_per_year?: number | null;
  max_conversion_total?: number | null;
}

export interface HealthcareInput {
  household_size?: number;
  monthly_slcsp_premium?: number;
  aca_coverage_years?: number[] | null;
  has_employer_coverage_after?: number | null;
}

export interface ScenarioInput {
  age: number;
  filing_status: FilingStatus;
  income_timeline: YearlyIncome[];
  traditional_ira_balance: number;
  roth_ira_balance?: number;
  retirement_age?: number;
  years_in_retirement?: number;
  annual_retirement_spending?: number | null;
  annual_growth_rate?: number;
  discount_rate?: number;
  conversion_preferences?: ConversionPreferences | null;
  healthcare?: HealthcareInput | null;
  state?: string | null;
  retirement_state?: string | null;
  custom_state_rate?: number | null;
}

export interface BracketFillResult {
  bracket_rate: number;
  bracket_min: number;
  bracket_max: number;
  bracket_capacity: number;
  filled_by_income: number;
  filled_by_conversion: number;
  remaining_capacity: number;
  tax_in_bracket: number;
}

export interface ScenarioComparison {
  label: string;
  conversion_amount: number;
  npv: number;
  tax_on_conversion: number;
  difference_from_optimal: number;
  estimated_savings?: number;
  yearly_conversions?: number[];
  years?: number[];
}

export interface AcaSubsidyDetail {
  year: number;
  magi_without_conversion: number;
  magi_with_conversion: number;
  subsidy_without_conversion: number;
  subsidy_with_conversion: number;
  subsidy_lost: number;
  federal_tax_cost: number;
  combined_cost: number;
  combined_marginal_rate: number;
  income_pct_fpl: number;
  hits_cliff: boolean;
}

export interface ReasoningTrace {
  binding_constraint: string;
  marginal_tax_rate_at_optimal: number;
  marginal_benefit_at_optimal: number;
  cost_of_next_bracket: {
    bracketRate: number;
    additionalTax: number;
    netEffect: number;
  };
  benefit_of_current_bracket: {
    bracketRate: number;
    taxPaid: number;
    futureTaxAvoided: number;
  };
  sensitivity_notes: string[];
  summary_points: {
    whatToConvert: string;
    whyThisAmount: string;
    howMuchYouSave: string;
    keyTradeoff: string;
  };
  aca_impact?: AcaSubsidyDetail[] | null;
  aca_summary?: {
    total_subsidy_lost: number;
    total_federal_tax: number;
    total_combined_cost: number;
    effective_combined_rate: number;
    years_with_subsidy_loss: number;
    years_hitting_cliff: number;
    explanation: string;
    worst_year_note?: string;
  } | null;
}

export interface YearlyDetail {
  year: number;
  income: number;
  conversion: number;
  tax_cost: number;
  marginal_bracket: number;
}

export interface TimelineChartPoint {
  year: number;
  income: number;
  conversion: number;
  bracket_boundaries: number[];
}

export interface ConversionCurvePoint {
  total_cap: number;
  yearly_conversions: number[];
  yearly_bracket_fill: BracketFillResult[][];
  yearly_detail: YearlyDetail[];
  total_tax: number;
  npv: number;
}

export interface OptimizationResult {
  yearly_conversions: number[];
  total_conversion: number;
  total_tax_on_conversions: number;
  overall_effective_rate: number;
  estimated_lifetime_tax_savings: number;
  npv_at_optimal: number;
  npv_at_zero: number;
  yearly_detail: YearlyDetail[];
  yearly_bracket_fill: BracketFillResult[][];
  scenarios: ScenarioComparison[];
  reasoning_trace: ReasoningTrace;
  traditional_at_retirement: number;
  roth_at_retirement: number;
  timeline_chart: TimelineChartPoint[];
  conversion_curve: ConversionCurvePoint[];
  unconstrained_npv?: number | null;
  unconstrained_conversions?: number[] | null;
  aca_subsidy_impact?: AcaSubsidyDetail[] | null;
  total_subsidy_lost?: number | null;
  subsidy_cliff_income?: number | null;
  npv_without_aca?: number | null;
  input: ScenarioInput;
}

export interface DemoPersona {
  name: string;
  age: number;
  occupation: string;
  previous_salary: string;
  situation: string;
  income_timeline: {
    year: number;
    income: string;
    event: string;
  }[];
  ira_balance: string;
  filing_status: string;
  key_insight: string;
}

export interface DemoResponse {
  persona: DemoPersona;
  input: ScenarioInput;
  result: OptimizationResult;
}
