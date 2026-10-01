import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/mocks/server";
import { EMPTY_DRAFT } from "@/lib/scenario/draft";
import { ConversationContext } from "../ConversationContext";
import fixtures from "../../../../../shared/fixtures/view-data.json";

const fixture = {
  result_id: fixtures.analyze_roth_conversions.result_id,
  structured_content: fixtures.analyze_roth_conversions.structured_content,
};
import { McpAppFrame } from "../parts/McpAppFrame";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

it("mounts the server's View in a sandbox on the API origin", async () => {
  server.use(
    http.get("http://localhost:8000/api/mcp-apps/resource", () =>
      HttpResponse.json({
        uri: "ui://roth-conversions/result-card.html",
        mimeType: "text/html;profile=mcp-app",
        html: "<!doctype html><p>view</p>",
        csp: { resourceDomains: ["https://fonts.gstatic.com"] },
        permissions: {},
      })
    )
  );
  render(
    <ConversationContext.Provider
      value={{
        results: {},
        draft: EMPTY_DRAFT,
        streaming: false,
        send: vi.fn(),
        editDraft: vi.fn(),
        openResults: vi.fn(),
        ensureResult: vi.fn(),
      }}
    >
      <McpAppFrame
        resourceUri="ui://roth-conversions/result-card.html"
        toolName="analyze_roth_conversions"
        toolInput={{}}
        toolResult={{ structuredContent: { result_id: "r_1" } }}
      />
    </ConversationContext.Provider>
  );
  expect(screen.getByText("Loading the result…")).toBeInTheDocument();
  const iframe = screen.getByTitle("analyze_roth_conversions result") as HTMLIFrameElement;
  expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms");
  await vi.waitFor(() => expect(iframe.src).toContain("http://localhost:8000/mcp-apps/sandbox"));
  expect(decodeURIComponent(iframe.src)).toContain("https://fonts.gstatic.com");
});

it("shows the shared card from structuredContent until the View is ready", () => {
  const openResults = vi.fn();
  render(
    <ConversationContext.Provider
      value={{
        results: { [fixture.result_id]: { result: null } as never },
        draft: EMPTY_DRAFT,
        streaming: false,
        send: vi.fn(),
        editDraft: vi.fn(),
        openResults,
        ensureResult: vi.fn(),
      }}
    >
      <McpAppFrame
        resourceUri="ui://roth-conversions/result-card.html"
        toolName="analyze_roth_conversions"
        toolInput={{}}
        toolResult={{ structuredContent: fixture.structured_content }}
      />
    </ConversationContext.Provider>
  );
  expect(screen.getByTestId("mcp-app-fallback")).toBeInTheDocument();
  expect(screen.queryByText("Loading the result…")).not.toBeInTheDocument();
  screen.getByRole("button", { name: "See full results" }).click();
  expect(openResults).toHaveBeenCalledWith(fixture.result_id);
});
