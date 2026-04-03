import type { LifeEvent } from "@/lib/types";

export const CHART_COLORS = {
  income: "#6C5CE7",
  conversion: "#F0C674",
  taxable: "#A8C5A0",
  remaining: "rgba(255, 255, 255, 0.04)",
  remainingStroke: "rgba(255, 255, 255, 0.08)",
  sliderTrack: "#2C2B3A",
} as const;

export const BRACKET_COLORS: Record<string, string> = {
  "0.10": "#4ADE80",
  "0.12": "#86EFAC",
  "0.22": "#FBBF24",
  "0.24": "#FB923C",
  "0.32": "#F87171",
  "0.35": "#EF4444",
  "0.37": "#DC2626",
};

export const LIFE_EVENT_LABELS: Record<LifeEvent, string> = {
  none: "—",
  grad_school: "Grad school",
  sabbatical: "Sabbatical",
  startup: "Startup",
  career_change: "Career change",
  part_time: "Part-time",
  early_retirement: "Early retirement",
  parental_leave: "Parental leave",
  back_to_work: "Back to work",
  layoff: "Layoff",
};

export const CURRENT_YEAR = new Date().getFullYear();
