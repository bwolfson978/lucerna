import { http, HttpResponse } from "msw";
import { sampleOptimizationResult, sampleDemoResponse } from "../fixtures/optimization-result";

const API_BASE = "http://localhost:8000";

export const handlers = [
  http.get(`${API_BASE}/health`, () => {
    return HttpResponse.json({ status: "ok" });
  }),

  http.post(`${API_BASE}/api/optimize`, async () => {
    return HttpResponse.json(sampleOptimizationResult);
  }),

  http.post(`${API_BASE}/api/email`, async () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API_BASE}/api/feedback`, async () => {
    return HttpResponse.json({ success: true, id: "feedback-1" });
  }),

  http.get(`${API_BASE}/api/demo`, () => {
    return HttpResponse.json(sampleDemoResponse);
  }),
];
