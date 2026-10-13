/**
 * Session token for backend calls. The Clerk bridge registers a getter once Clerk has
 * loaded; API clients outside React (lib/api, lib/agent, lib/mcp-apps) call
 * `authHeaders()` to add it. Signed out or without accounts, there's no header.
 */

type TokenGetter = () => Promise<string | null>;

let getter: TokenGetter | null = null;

export function setTokenGetter(next: TokenGetter | null): void {
  getter = next;
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!getter) return {};
  try {
    const token = await getter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
