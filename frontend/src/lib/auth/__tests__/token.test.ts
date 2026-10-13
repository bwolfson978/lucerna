import { afterEach, describe, expect, it } from "vitest";
import { authHeaders, setTokenGetter } from "@/lib/auth/token";

describe("authHeaders", () => {
  afterEach(() => setTokenGetter(null));

  it("is empty without accounts or when signed out", async () => {
    expect(await authHeaders()).toEqual({});
    setTokenGetter(async () => null);
    expect(await authHeaders()).toEqual({});
  });

  it("sends the session token as a bearer header", async () => {
    setTokenGetter(async () => "tok");
    expect(await authHeaders()).toEqual({ Authorization: "Bearer tok" });
  });

  it("carries on signed out when the token can't be fetched", async () => {
    setTokenGetter(async () => {
      throw new Error("offline");
    });
    expect(await authHeaders()).toEqual({});
  });
});
