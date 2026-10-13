import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { setTokenGetter } from "@/lib/auth/token";
import { SavedScenarioError, savedScenarioHref, savedScenarios } from "@/lib/api/savedScenarios";
import { EMPTY_DRAFT } from "@/lib/scenario/draft";

const API = "http://localhost:8000/api/saved-scenarios";

const SUMMARY = {
  scenario_id: "abc",
  name: "Plan A",
  saved_at: "2026-10-13T12:00:00Z",
  age: 52,
  filing_status: "single",
  traditional_balance: 600000,
  retirement_age: 60,
  state: null,
  complete: true,
};

describe("savedScenarios", () => {
  afterEach(() => setTokenGetter(null));

  it("lists with the session token", async () => {
    setTokenGetter(async () => "tok");
    let auth: string | null = null;
    server.use(
      http.get(API, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ saved_scenarios: [SUMMARY] });
      })
    );
    expect(await savedScenarios.list()).toEqual([SUMMARY]);
    expect(auth).toBe("Bearer tok");
  });

  it("saves a draft with an optional name", async () => {
    let body: unknown = null;
    server.use(
      http.post(API, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(SUMMARY, { status: 201 });
      })
    );
    await savedScenarios.save(EMPTY_DRAFT);
    expect(body).toEqual({ draft: EMPTY_DRAFT, name: null });
  });

  it("renames and deletes", async () => {
    server.use(
      http.patch(`${API}/abc`, () => HttpResponse.json({ ...SUMMARY, name: "Plan B" })),
      http.delete(`${API}/abc`, () => new HttpResponse(null, { status: 204 }))
    );
    expect((await savedScenarios.rename("abc", "Plan B")).name).toBe("Plan B");
    await expect(savedScenarios.remove("abc")).resolves.toBeUndefined();
  });

  it("turns API errors into coded errors", async () => {
    server.use(
      http.get(`${API}/gone`, () =>
        HttpResponse.json(
          { detail: { code: "not_found", message: "That saved scenario wasn't found." } },
          { status: 404 }
        )
      ),
      http.get(API, () => HttpResponse.json({ detail: "Sign in first." }, { status: 401 }))
    );
    await expect(savedScenarios.get("gone")).rejects.toMatchObject({
      code: "not_found",
      message: "That saved scenario wasn't found.",
    });
    const err = await savedScenarios.list().catch((e) => e);
    expect(err).toBeInstanceOf(SavedScenarioError);
    expect(err.code).toBe("sign_in_required");
  });

  it("reports network failures", async () => {
    server.use(http.get(API, () => HttpResponse.error()));
    await expect(savedScenarios.list()).rejects.toMatchObject({ code: "network" });
  });

  it("links to the scenario screen", () => {
    expect(savedScenarioHref("a b")).toBe("/calculator?saved=a%20b");
  });
});
