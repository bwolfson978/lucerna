import type { OptimizationResult, DemoResponse } from "@/lib/types";

export const sampleOptimizationResult: OptimizationResult = {
  yearly_conversions: [45000, 50000, 0],
  total_conversion: 95000,
  total_tax_on_conversions: 14200,
  overall_effective_rate: 0.1495,
  estimated_lifetime_tax_savings: 28500,
  npv_at_optimal: 620000,
  npv_at_zero: 591500,
  yearly_detail: [
    {
      year: 2026,
      income: 35000,
      conversion: 45000,
      tax_cost: 6300,
      marginal_bracket: 0.22,
    },
    {
      year: 2027,
      income: 30000,
      conversion: 50000,
      tax_cost: 7900,
      marginal_bracket: 0.22,
    },
    {
      year: 2028,
      income: 150000,
      conversion: 0,
      tax_cost: 0,
      marginal_bracket: 0.24,
    },
  ],
  yearly_bracket_fill: [
    [
      {
        bracket_rate: 0.1,
        bracket_min: 0,
        bracket_max: 11925,
        bracket_capacity: 11925,
        filled_by_income: 11925,
        filled_by_conversion: 0,
        remaining_capacity: 0,
        tax_in_bracket: 1192.5,
      },
      {
        bracket_rate: 0.12,
        bracket_min: 11925,
        bracket_max: 48475,
        bracket_capacity: 36550,
        filled_by_income: 8075,
        filled_by_conversion: 28475,
        remaining_capacity: 0,
        tax_in_bracket: 4386,
      },
      {
        bracket_rate: 0.22,
        bracket_min: 48475,
        bracket_max: 103350,
        bracket_capacity: 54875,
        filled_by_income: 0,
        filled_by_conversion: 16525,
        remaining_capacity: 38350,
        tax_in_bracket: 3635.5,
      },
    ],
  ],
  scenarios: [
    {
      label: "No conversion",
      conversion_amount: 0,
      npv: 591500,
      tax_on_conversion: 0,
      difference_from_optimal: -28500,
      estimated_savings: 0,
      yearly_conversions: [0, 0, 0],
      years: [2026, 2027, 2028],
    },
    {
      label: "Highest estimated savings",
      conversion_amount: 95000,
      npv: 620000,
      tax_on_conversion: 14200,
      difference_from_optimal: 0,
      estimated_savings: 28500,
      yearly_conversions: [45000, 50000, 0],
      years: [2026, 2027, 2028],
    },
    {
      label: "Full conversion (year 1)",
      conversion_amount: 210000,
      npv: 602000,
      tax_on_conversion: 42000,
      difference_from_optimal: -18000,
      estimated_savings: 10500,
      yearly_conversions: [210000, 0, 0],
      years: [2026, 2027, 2028],
    },
  ],
  reasoning_trace: {
    binding_constraint: "bracket_boundary",
    marginal_benefit_at_optimal: 0.02,
    cost_of_converting_more: {
      year: 2026,
      extra_conversion: 1000,
      additional_tax: 240,
      federal_tax_by_bracket: [{ bracket: "24%", amount_taxed: 1000, tax: 240 }],
      schedule_stops_in_bracket: "22%",
      room_left_in_that_bracket: 0,
      next_bracket: "24%",
      explanation:
        "Converting $1,000 more in 2026 would cost $240 in additional tax: $1,000 in the 24% bracket.",
    },
    cost_and_benefit_of_conversions: {
      average_tax_rate: 0.22,
      tax_paid: 3635,
      future_tax_avoided: 5200,
    },
    sensitivity_notes: [
      "Increasing conversion by $10K would push into 24% bracket",
      "Growth rate sensitivity: ±1% changes savings by ~$3K",
    ],
    summary_points: {
      whatToConvert: "Convert $45K in 2026 and $50K in 2027",
      whyThisAmount: "Fills the 12% and part of the 22% bracket in both low-income years",
      howMuchYouSave: "Approximately $28,500 in lifetime tax savings vs. not converting",
      keyTradeoff:
        "Converting more would push into the 24% bracket, where the marginal cost exceeds the benefit",
    },
  },
  traditional_at_retirement: 345000,
  roth_at_retirement: 275000,
  timeline_chart: [
    { year: 2026, income: 35000, conversion: 45000, bracket_boundaries: [11925, 48475, 103350] },
    { year: 2027, income: 30000, conversion: 50000, bracket_boundaries: [11925, 48475, 103350] },
    { year: 2028, income: 150000, conversion: 0, bracket_boundaries: [11925, 48475, 103350] },
  ],
  input: {
    age: 38,
    filing_status: "single",
    timeline: [
      { year: 2026, gross_income: 35000, notes: "Startup year 1" },
      { year: 2027, gross_income: 30000, notes: "Startup year 2" },
      { year: 2028, gross_income: 150000, notes: "Back to work" },
    ],
    traditional_ira_balance: 210000,
    roth_ira_balance: 5000,
    drawdown_start_age: 65,
    planning_horizon_age: 90,
    annual_growth_rate: 0.07,
    discount_rate: 0.05,
  },
  // What the server sends for the result card and results page (no slider curve).
  display: {
    card: {
      result_id: "r_sample",
      estimated_lifetime_tax_savings_todays_dollars: 28500,
      total_conversion: 95000,
      total_tax_on_conversions: 14200,
      years_with_conversions: 2,
      schedule_by_year: [
        { year: 2026, conversion: 45000 },
        { year: 2027, conversion: 50000 },
        { year: 2028, conversion: 0 },
      ],
    },
    view: {
      bracket_fill: {
        years: [
          { year: 2026, age: 38, income: 35000, rmd: 0, conversion: 45000, tax: 6500 },
          { year: 2027, age: 39, income: 30000, rmd: 0, conversion: 50000, tax: 7700 },
          { year: 2028, age: 40, income: 150000, rmd: 0, conversion: 0, tax: 0 },
        ],
        brackets: [
          { rate: 0.1, min: 0, max: 11925 },
          { rate: 0.12, min: 11925, max: 48475 },
          { rate: 0.22, min: 48475, max: 103350 },
          { rate: 0.24, min: 103350, max: null },
        ],
        standard_deduction: 16100,
      },
    },
  },
};

export const sampleDemoResponse: DemoResponse = {
  persona: {
    name: "Margaret",
    age: 63,
    occupation: "Registered Nurse",
    previous_salary: "$88,000/year",
    situation:
      "Retired last year after a 35-year nursing career. Living off a taxable brokerage account and cash. Social Security deferred. Traditional 401(k) of $1.4M will trigger mandatory distributions at 73.",
    milestones: [
      { year: 2026, income: "$20K", event: "Living off brokerage, no Social Security yet" },
      { year: 2030, income: "$46K", event: "Claims Social Security at full retirement age" },
      { year: 2036, income: "RMDs begin", event: "Mandatory distributions on $1.4M+ balance" },
    ],
    ira_balance: "$1,400,000 traditional + $52,000 Roth",
    filing_status: "Married Filing Jointly",
    key_insight:
      "The 10-year window between retirement and mandatory distributions lets Margaret convert at 12-22% today. Once RMDs begin on a balance that may exceed $2M in today's dollars, combined income could push her marginal rate significantly higher.",
  },
  input: sampleOptimizationResult.input,
  result: sampleOptimizationResult,
};
