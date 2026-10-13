import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/mocks/server";
import { testAccount, withAccount } from "@/test/account";
import { useSaveScenario } from "@/hooks/useSaveScenario";
import { EMPTY_DRAFT, type ScenarioDraft } from "@/lib/scenario/draft";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

const API = "http://localhost:8000/api/saved-scenarios";
const DRAFT: ScenarioDraft = { ...EMPTY_DRAFT, age: 52, retirement_age: 60 };

function saveHandler(onSave = vi.fn()) {
  server.use(
    http.post(API, async ({ request }) => {
      onSave(await request.json());
      return HttpResponse.json({ scenario_id: "abc", name: "Retire at 60" }, { status: 201 });
    })
  );
  return onSave;
}

describe("useSaveScenario", () => {
  afterEach(() => sessionStorage.clear());

  it("saves when signed in, and resets when the scenario changes", async () => {
    const onSave = saveHandler();
    const { result, rerender } = renderHook(({ draft }) => useSaveScenario(draft, "calculator"), {
      initialProps: { draft: DRAFT },
      wrapper: withAccount(testAccount()),
    });
    act(() => result.current.save());
    await waitFor(() => expect(result.current.status.state).toBe("saved"));
    expect(result.current.status).toMatchObject({ name: "Retire at 60", scenarioId: "abc" });
    expect(onSave).toHaveBeenCalledWith({ draft: DRAFT, name: null });

    rerender({ draft: { ...DRAFT, age: 53 } });
    expect(result.current.status.state).toBe("idle");
  });

  it("signed out, opens sign-in and saves once back", async () => {
    const onSave = saveHandler();
    const signedOut = testAccount({ signedIn: false, userId: null });
    const first = renderHook(() => useSaveScenario(DRAFT, "calculator"), {
      wrapper: withAccount(signedOut),
    });
    act(() => first.result.current.save());
    expect(signedOut.openSignIn).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    first.unmount();

    // Back from Google: the page loads again, signed in.
    const second = renderHook(() => useSaveScenario(DRAFT, "calculator"), {
      wrapper: withAccount(testAccount()),
    });
    await waitFor(() => expect(second.result.current.status.state).toBe("saved"));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message when saving fails", async () => {
    server.use(
      http.post(API, () =>
        HttpResponse.json(
          { detail: { code: "full", message: "You've reached the limit of saved scenarios." } },
          { status: 409 }
        )
      )
    );
    const { result } = renderHook(() => useSaveScenario(DRAFT, "calculator"), {
      wrapper: withAccount(testAccount()),
    });
    act(() => result.current.save());
    await waitFor(() => expect(result.current.status.state).toBe("error"));
    expect(result.current.status).toMatchObject({
      message: "You've reached the limit of saved scenarios.",
    });
  });

  it("does nothing without accounts", () => {
    const disabled = testAccount({ enabled: false, signedIn: false });
    const { result } = renderHook(() => useSaveScenario(DRAFT, "calculator"), {
      wrapper: withAccount(disabled),
    });
    act(() => result.current.save());
    expect(disabled.openSignIn).not.toHaveBeenCalled();
    expect(result.current.available).toBe(false);
  });
});
