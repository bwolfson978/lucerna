import { http, HttpResponse } from 'msw'

const API_BASE = 'http://localhost:8000'

export const handlers = [
  http.get(`${API_BASE}/health`, () => {
    return HttpResponse.json({ status: 'ok' })
  }),

  http.post(`${API_BASE}/api/optimize`, async ({ request }) => {
    return HttpResponse.json({
      optimal_conversion: 25000,
      tax_impact: { /* stub */ },
      projections: [],
      reasoning_trace: { conversion_amount: 25000, reasoning_steps: ['Step 1'] },
    })
  }),

  http.post(`${API_BASE}/api/chat`, async ({ request }) => {
    return HttpResponse.json({
      response: 'Based on your inputs, converting $25,000 this year could save approximately $15,000 in lifetime taxes.',
    })
  }),

  http.post(`${API_BASE}/api/email`, async ({ request }) => {
    return HttpResponse.json({ success: true })
  }),

  http.post(`${API_BASE}/api/feedback`, async ({ request }) => {
    return HttpResponse.json({ success: true })
  }),

  http.get(`${API_BASE}/api/demo`, () => {
    return HttpResponse.json({
      optimal_conversion: 30000,
      tax_impact: {},
      projections: [],
      reasoning_trace: { conversion_amount: 30000, reasoning_steps: ['Demo step'] },
    })
  }),
]
