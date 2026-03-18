/** Shared test data for E2E tests — "Alex" demo scenario */

export const alexScenario = {
  age: 45,
  income: 85000,
  filing_status: 'single' as const,
  retirement_age: 65,
  traditional_ira_balance: 500000,
  current_tax_state: 'CA',
  retirement_tax_state: 'TX',
}

export const expectedResults = {
  /** Alex's optimal conversion should be a positive number */
  minConversion: 1000,
  maxConversion: 100000,
}
