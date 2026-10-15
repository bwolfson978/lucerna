import type { ScenarioDraft } from "@/lib/scenario/draft";
import type { OptimizationResult } from "@/lib/types";
import { API_URL } from "@/lib/utils/constants";

export interface ScenarioLinkResult {
  result_id: string;
  label: string;
  draft: ScenarioDraft;
  result: OptimizationResult;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

  /** Feedback or a problem report, filed in PostHog Surveys (backend app/tools/feedback.py). */
  async submitFeedback(input: {
    kind: "feedback" | "problem";
    message: string;
    expected?: string;
    email?: string;
    page_url?: string;
    error_digest?: string;
    distinct_id?: string;
    session_id?: string;
  }) {
    const res = await fetch(`${API_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const detail = typeof body?.detail === "string" ? body.detail : null;
      throw new Error(detail ?? "That didn't send. Please try again in a moment.");
    }
    return res.json() as Promise<{ success: boolean; id: string }>;
  },
};
