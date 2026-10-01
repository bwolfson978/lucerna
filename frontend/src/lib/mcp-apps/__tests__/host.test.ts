import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { callAppTool, fetchView, routeOpenLink, sandboxOrigin, sandboxUrl } from "../host";

const API = "http://localhost:8000";

describe("routeOpenLink", () => {
  it("opens known results in the app", () => {
    const url = "https://rothconversionsoptimizer.com/calculator?view=results&result=r_1";
    expect(routeOpenLink(url, ["r_1"])).toEqual({ type: "results", resultId: "r_1" });
  });

  it("opens full results links for unknown results on this deployment", () => {
    const link =
      "https://rothconversionsoptimizer.com/calculator?view=results&result=r_2&scenario=eyJ9";
    expect(routeOpenLink(link, ["r_1"])).toEqual({
      type: "external",
      url: `${window.location.origin}/calculator?view=results&result=r_2&scenario=eyJ9`,
    });
  });

  it("opens anything else externally", () => {
    const unknown = "https://rothconversionsoptimizer.com/calculator?view=results&result=r_2";
    expect(routeOpenLink(unknown, ["r_1"])).toEqual({ type: "external", url: unknown });
    expect(routeOpenLink("https://example.com", [])).toEqual({
      type: "external",
      url: "https://example.com",
    });
    expect(routeOpenLink("not a url", [])).toEqual({ type: "external", url: "not a url" });
  });
});

describe("sandbox", () => {
  it("lives on the API's origin, not the page's, and carries the declared CSP", () => {
    const url = new URL(sandboxUrl({ resourceDomains: ["https://fonts.gstatic.com"] }));
    expect(url.origin).toBe(sandboxOrigin());
    expect(url.origin).not.toBe(window.location.origin);
    expect(JSON.parse(url.searchParams.get("csp")!)).toEqual({
      resourceDomains: ["https://fonts.gstatic.com"],
    });
    expect(url.searchParams.get("host")).toBe(window.location.origin);
  });
});

describe("fetchView and callAppTool", () => {
  it("reads a View once and caches it", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/mcp-apps/resource`, ({ request }) => {
        calls += 1;
        const uri = new URL(request.url).searchParams.get("uri");
        return HttpResponse.json({
          uri,
          mimeType: "text/html;profile=mcp-app",
          html: "<p>",
          csp: {},
          permissions: {},
        });
      })
    );
    const first = await fetchView("ui://test/a.html");
    await fetchView("ui://test/a.html");
    expect(first.uri).toBe("ui://test/a.html");
    expect(calls).toBe(1);
  });

  it("brokers a View's tool call and reports failures as tool errors", async () => {
    server.use(
      http.post(`${API}/api/mcp-apps/tools/call`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return body.name === "ok"
          ? HttpResponse.json({ structuredContent: { value: 1 } })
          : new HttpResponse(null, { status: 403 });
      })
    );
    expect(await callAppTool("ok", {})).toEqual({ structuredContent: { value: 1 } });
    expect((await callAppTool("denied", {})).isError).toBe(true);
  });
});
