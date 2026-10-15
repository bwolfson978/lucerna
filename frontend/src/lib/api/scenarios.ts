import type {
  OptimizationResult,
  SavedScenario,
  SavedScenarioDetail,
  ScenarioInput,
} from "@/lib/types";
import { API_URL } from "@/lib/utils/constants";

async function authedRequest<T>(
  path: string,
  getToken: () => Promise<string | null>,
  options?: RequestInit
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
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
    /** `keepalive` lets the request finish while the page unloads (a pending undo window). */
    delete(id: string, opts?: { keepalive?: boolean }) {
      return authedRequest<void>(`/api/scenarios/${id}`, getToken, {
        method: "DELETE",
        keepalive: opts?.keepalive,
      });
    },
    /** Erase everything stored for the account (saved scenarios) before deleting the user. */
    deleteAccountData() {
      return authedRequest<{ deleted_scenarios: number }>("/api/account", getToken, {
        method: "DELETE",
      });
    },
  };
}
