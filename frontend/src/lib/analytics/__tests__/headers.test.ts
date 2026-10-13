import { describe, expect, it, vi } from "vitest";
import posthog from "posthog-js";
import { analyticsHeaders } from "@/lib/analytics/headers";

vi.mock("posthog-js", () => ({
  default: { __loaded: false, get_distinct_id: vi.fn(), get_session_id: vi.fn() },
}));

describe("analyticsHeaders", () => {
  it("is empty when PostHog isn't loaded", () => {
    expect(analyticsHeaders()).toEqual({});
  });

  it("sends the browser's distinct and session ids", () => {
    const ph = posthog as unknown as {
      __loaded: boolean;
      get_distinct_id: ReturnType<typeof vi.fn>;
      get_session_id: ReturnType<typeof vi.fn>;
    };
    ph.__loaded = true;
    ph.get_distinct_id.mockReturnValue("anon_1");
    ph.get_session_id.mockReturnValue("s_1");
    expect(analyticsHeaders()).toEqual({
      "X-POSTHOG-DISTINCT-ID": "anon_1",
      "X-POSTHOG-SESSION-ID": "s_1",
    });
    ph.get_session_id.mockImplementation(() => {
      throw new Error("no session");
    });
    expect(analyticsHeaders()).toEqual({});
  });
});
