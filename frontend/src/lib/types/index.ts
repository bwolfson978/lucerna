export type FilingStatus = "single" | "married_filing_jointly";

export interface PlanYear {
  year: number;
  gross_income: number;
  drawdown?: number | null;
  notes?: string;
  state?: string | null;
}

// Backward-compat alias
export type YearlyIncome = PlanYear;

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
  timeline: PlanYear[]; // was income_timeline
  traditional_ira_balance: number;
  roth_ira_balance?: number;
  drawdown_start_age?: number; // was retirement_age
  default_drawdown?: number | null; // was annual_retirement_spending
  planning_horizon_age?: number; // was years_in_retirement (now absolute age)
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

export interface RmdYearDetail {
  year: number;
  age: number;
  trad_balance_start: number;
  rmd_amount: number;
  actual_distribution: number;
  tax_on_distribution: number;
  effective_rate: number;
}

export interface RmdProjection {
  rmd_start_age: number;
  rmd_start_year: number;
  yearly_detail: RmdYearDetail[];
  total_rmd_taxes: number;
  peak_rmd_amount: number;
  peak_rmd_year: number;
}

export interface IrmaaYearDetail {
  conversion_year: number;
  surcharge_year: number;
  surcharge_age: number;
  magi: number;
  irmaa_annual_cost: number;
  irmaa_tier: number;
}

export interface IrmaaProjection {
  yearly_detail: IrmaaYearDetail[];
  total_irmaa_cost: number;
  peak_irmaa_year: number;
  peak_irmaa_amount: number;
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
  rmd_summary?: {
    rmd_start_age: number;
    total_rmd_taxes_no_conversion: number;
    peak_rmd_no_conversion: number;
    peak_rmd_year_no_conversion: number;
    total_rmd_taxes_with_conversion: number;
    peak_rmd_with_conversion: number;
    rmd_tax_savings: number;
    peak_rmd_reduction: number;
    explanation: string;
  } | null;
  irmaa_summary?: {
    total_irmaa_no_conversion?: number;
    peak_irmaa_no_conversion?: number;
    total_irmaa_with_conversion?: number;
    peak_irmaa_with_conversion?: number;
    irmaa_additional_cost?: number;
    explanation: string;
  } | null;
}

export interface YearlyDetail {
  year: number;
  income: number;
  conversion: number;
  tax_cost: number;
  federal_tax_cost?: number;
  state_tax_cost?: number;
  effective_rate?: number;
  marginal_bracket: string | number;
  state_marginal_rate?: number;
  subsidy_lost?: number;
  combined_cost?: number;
  combined_rate?: number;
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
  rmd_projection?: RmdProjection | null;
  rmd_projection_no_conversion?: RmdProjection | null;
  irmaa_projection?: IrmaaProjection | null;
  irmaa_projection_no_conversion?: IrmaaProjection | null;
  input: ScenarioInput;
}

export interface DemoPersona {
  name: string;
  age: number;
  occupation: string;
  previous_salary: string;
  situation: string;
  milestones: {
    // was income_timeline
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
