export const sampleOptimizationResult = {
  optimal_conversion: 25000,
  tax_impact: {
    current_year_tax_increase: 5500,
    lifetime_tax_savings: 15000,
    effective_rate: 0.22,
  },
  projections: [
    { year: 2024, traditional_balance: 475000, roth_balance: 25000, tax_paid: 5500 },
    { year: 2025, traditional_balance: 450000, roth_balance: 52000, tax_paid: 0 },
  ],
  reasoning_trace: {
    conversion_amount: 25000,
    tax_impact: 'Fills 22% bracket',
    npv_difference: 15000,
    reasoning_steps: [
      'Current taxable income: $75,000',
      'Top of 22% bracket: $100,525',
      'Available bracket space: $25,525',
      'Recommended conversion: $25,000',
    ],
  },
}
