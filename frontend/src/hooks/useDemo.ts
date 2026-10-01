import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { DemoResponse } from "@/lib/types";

type DemoState =
  | { status: "loading"; demo: null }
  | { status: "ready"; demo: DemoResponse }
  | { status: "error"; demo: null };

/** Fetches the Margaret demo scenario computed by the engine. */
export function useDemo(): DemoState {
  const [state, setState] = useState<DemoState>({ status: "loading", demo: null });

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getDemo()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", demo: data as DemoResponse });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", demo: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
