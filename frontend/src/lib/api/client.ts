const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
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

  getDemo() {
    return request("/api/demo");
  },

  chat(input: { message: string; context: Record<string, unknown> }) {
    return request("/api/chat", {
      method: "POST",
      body: JSON.stringify(input),
    });
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
