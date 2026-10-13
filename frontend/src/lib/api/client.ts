import { authHeaders } from "@/lib/auth/token";
import type { ScenarioDraft } from "@/lib/scenario/draft";
import type { OptimizationResult } from "@/lib/types";

export interface ScenarioLinkResult {
  result_id: string;
  label: string;
  draft: ScenarioDraft;
  result: OptimizationResult;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const apiClient = {
  optimize(input: Record<string, unknown>) {
    return request("/api/optimize", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Open a full results link from another app (backend app/tools/links.py). */
  openScenarioLink(scenario: string, label?: string | null) {
    return request<ScenarioLinkResult>("/api/scenario-links/open", {
      method: "POST",
      body: JSON.stringify({ scenario, label: label ?? null }),
    });
  },

  getDemo() {
    return request("/api/demo");
  },

  submitEmail(email: string) {
    return request("/api/email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  submitFeedback(input: { rating: number; comment: string }) {
    return request("/api/feedback", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
