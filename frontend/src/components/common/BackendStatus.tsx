"use client";

import { useEffect, useState } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function BackendStatus() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => {
        setStatus(res.ok ? "ok" : "error");
      })
      .catch(() => {
        setStatus("error");
      });
  }, []);

  const color =
    status === "ok"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-yellow-500 animate-pulse";

  const label =
    status === "ok"
      ? "Backend connected"
      : status === "error"
        ? "Backend unreachable"
        : "Checking backend…";

  return (
    <span className="inline-flex items-center gap-1.5 text-body-sm text-text-tertiary">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
