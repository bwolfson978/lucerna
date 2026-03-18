import { http, HttpResponse } from 'msw'
import {
  sampleOptimizationResult,
  sampleDemoResponse,
} from '../fixtures/optimization-result'

const API_BASE = 'http://localhost:8000'

export const handlers = [
  http.get(`${API_BASE}/health`, () => {
    return HttpResponse.json({ status: 'ok' })
  }),

  http.post(`${API_BASE}/api/optimize`, async () => {
    return HttpResponse.json(sampleOptimizationResult)
  }),

  http.post(`${API_BASE}/api/chat`, async () => {
    return HttpResponse.json({
      response: 'Based on your inputs, converting $45,000 in 2026 and $50,000 in 2027 could save approximately $28,500 in lifetime taxes by filling the 12% and 22% brackets during your low-income years.',
    })
  }),

  http.post(`${API_BASE}/api/email`, async () => {
    return HttpResponse.json({ success: true })
  }),

  http.post(`${API_BASE}/api/feedback`, async () => {
    return HttpResponse.json({ success: true })
  }),

  http.get(`${API_BASE}/api/demo`, () => {
    return HttpResponse.json(sampleDemoResponse)
  }),
]
