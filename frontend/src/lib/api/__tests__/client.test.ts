import { describe, it, expect } from 'vitest'
import { apiClient } from '@/lib/api/client'

describe('apiClient', () => {
  it('fetches optimization results', async () => {
    const result = await apiClient.optimize({
      age: 45,
      income: 85000,
      filing_status: 'single',
      traditional_ira_balance: 500000,
    })
    expect(result.optimal_conversion).toBeDefined()
  })

  it('fetches demo results', async () => {
    const result = await apiClient.getDemo()
    expect(result.optimal_conversion).toBeDefined()
  })

  it('sends chat message', async () => {
    const result = await apiClient.chat({
      message: 'Why should I convert?',
      context: {},
    })
    expect(result.response).toBeDefined()
  })

  it('submits email', async () => {
    const result = await apiClient.submitEmail('test@example.com')
    expect(result.success).toBe(true)
  })

  it('submits feedback', async () => {
    const result = await apiClient.submitFeedback({
      rating: 5,
      comment: 'Great tool!',
    })
    expect(result.success).toBe(true)
  })
})
