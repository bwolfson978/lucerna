import type {
  OptimizationResult,
  SavedScenario,
  SavedScenarioDetail,
  ScenarioInput,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function authedRequest<T>(
  path: string,
  getToken: () => Promise<string | null>,
  options?: RequestInit
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function createScenariosApi(getToken: () => Promise<string | null>) {
  return {
    save(input: ScenarioInput, result: OptimizationResult) {
      return authedRequest<{ id: string; name: string }>("/api/scenarios", getToken, {
        method: "POST",
        body: JSON.stringify({ input, result }),
      });
    },
    list() {
      return authedRequest<SavedScenario[]>("/api/scenarios", getToken);
    },
    get(id: string) {
      return authedRequest<SavedScenarioDetail>(`/api/scenarios/${id}`, getToken);
    },
    delete(id: string) {
      return authedRequest<void>(`/api/scenarios/${id}`, getToken, { method: "DELETE" });
    },
    /** Erase everything stored for the account (saved scenarios) before deleting the user. */
    deleteAccountData() {
      return authedRequest<{ deleted_scenarios: number }>("/api/account", getToken, {
        method: "DELETE",
      });
    },
  };
}
