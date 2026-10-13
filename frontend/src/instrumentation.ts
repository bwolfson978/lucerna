import type { Instrumentation } from "next";

export function register() {}

/**
 * Reports errors thrown while rendering or handling a request on the server to PostHog
 * error tracking. The browser's own errors are captured by posthog-js
 * (instrumentation-client.ts, app/error.tsx, app/global-error.tsx).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (process.env.NEXT_RUNTIME !== "nodejs" || !token) return;

  const { PostHog } = await import("posthog-node");
  const posthog = new PostHog(token, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  try {
    await posthog.captureExceptionImmediate(
      err,
      distinctIdFromCookie(request.headers.cookie, token),
      {
        path: request.path,
        method: request.method,
        router_kind: context.routerKind,
        route_path: context.routePath,
        route_type: context.routeType,
      }
    );
  } catch {
    // Reporting must never turn into a second error.
  } finally {
    await posthog.shutdown();
  }
};

/** The visitor's PostHog id from the posthog-js cookie, so server errors join their session. */
function distinctIdFromCookie(cookie: string | string[] | undefined, token: string) {
  const header = Array.isArray(cookie) ? cookie.join("; ") : (cookie ?? "");
  const name = `ph_${token}_posthog=`;
  const raw = header
    .split(/;\s*/)
    .find((part) => part.startsWith(name))
    ?.slice(name.length);
  if (!raw) return undefined;
  try {
    const id = JSON.parse(decodeURIComponent(raw)).distinct_id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}
