/** The signed-in user's saved scenarios (backend app/api/saved_scenarios.py). */

import { authHeaders } from "@/lib/auth/token";
import type { ScenarioDraft } from "@/lib/scenario/draft";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SavedScenarioSummary {
  scenario_id: string;
  name: string;
  saved_at: string;
  age: number | null;
  filing_status: "single" | "married_filing_jointly" | null;
  traditional_balance: number | null;
  retirement_age: number | null;
  state: string | null;
  complete: boolean;
}

export interface SavedScenario extends SavedScenarioSummary {
  /** Projected from this year when opened. */
  draft: ScenarioDraft;
}

export type SavedErrorCode =
  | "sign_in_required"
  | "not_found"
  | "full"
  | "empty"
  | "invalid"
  | "unavailable"
  | "network";

export class SavedScenarioError extends Error {
  constructor(
    readonly code: SavedErrorCode,
    message: string
  ) {
    super(message);
  }
}

const FALLBACK: Record<number, SavedErrorCode> = {
  401: "sign_in_required",
  404: "not_found",
  409: "full",
  422: "invalid",
  503: "unavailable",
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/saved-scenarios${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    });
  } catch {
    throw new SavedScenarioError("network", "We couldn't reach the server. Try again.");
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const code: SavedErrorCode = detail?.code ?? FALLBACK[res.status] ?? "unavailable";
    const message =
      typeof detail?.message === "string"
        ? detail.message
        : code === "sign_in_required"
          ? "Sign in to save scenarios."
          : "Something went wrong. Try again.";
    throw new SavedScenarioError(code, message);
  }
  return body as T;
}

export const savedScenarios = {
  list: () => call<{ saved_scenarios: SavedScenarioSummary[] }>("").then((r) => r.saved_scenarios),
  get: (id: string) => call<SavedScenario>(`/${encodeURIComponent(id)}`),
  save: (draft: ScenarioDraft, name?: string) =>
    call<SavedScenarioSummary>("", {
      method: "POST",
      body: JSON.stringify({ draft, name: name ?? null }),
    }),
  rename: (id: string, name: string) =>
    call<SavedScenarioSummary>(`/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) => call<void>(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** Where a saved scenario opens: the scenario screen with its values filled in. */
export function savedScenarioHref(id: string): string {
  return `/calculator?saved=${encodeURIComponent(id)}`;
}
