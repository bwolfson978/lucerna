import type {
  OptimizationResult,
  SavedScenario,
  SavedScenarioDetail,
  ScenarioInput,
} from "@/lib/types";
import type { ScenarioDraft } from "@/lib/scenario/draft";
import { API_URL } from "@/lib/utils/constants";

/** A failed request, with its HTTP status (404 when the scenario is gone). */
export class ScenariosApiError extends Error {
  constructor(
    readonly status: number,
    statusText: string
  ) {
    super(`API error: ${status} ${statusText}`);
  }
}

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
    throw new ScenariosApiError(res.status, res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function createScenariosApi(getToken: () => Promise<string | null>) {
  return {
    /** Save a new scenario. `draft` lets it reopen exactly, here and in a chat. */
    save(input: ScenarioInput, result: OptimizationResult, draft?: ScenarioDraft) {
      return authedRequest<{ id: string; name: string }>("/api/scenarios", getToken, {
        method: "POST",
        body: JSON.stringify({ input, result, draft }),
      });
    },
    /** Overwrite a saved scenario with its latest inputs and results. */
    update(id: string, input: ScenarioInput, result: OptimizationResult, draft?: ScenarioDraft) {
      return authedRequest<{ id: string; name: string }>(`/api/scenarios/${id}`, getToken, {
        method: "PUT",
        body: JSON.stringify({ input, result, draft }),
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
