import { http, HttpResponse } from "msw";
import { sampleOptimizationResult, sampleDemoResponse } from "../fixtures/optimization-result";
import { API_URL } from "@/lib/utils/constants";

export const handlers = [
  http.get(`${API_URL}/health`, () => {
    return HttpResponse.json({ status: "ok" });
  }),

  http.post(`${API_URL}/api/optimize`, async () => {
    return HttpResponse.json(sampleOptimizationResult);
  }),

  http.post(`${API_URL}/api/email`, async () => {
    return HttpResponse.json({ success: true });
  }),

  http.post(`${API_URL}/api/feedback`, async () => {
    return HttpResponse.json({ success: true, id: "feedback-1" });
  }),

  http.get(`${API_URL}/api/demo`, () => {
    return HttpResponse.json(sampleDemoResponse);
  }),
];
