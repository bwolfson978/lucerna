/** "Paper & Pine" palette. Keep in sync with tailwind/preset.js and docs/design-aesthetic.md. */
export const PALETTE = {
  ink: "#141414",
  inkSoft: "#3d3d3d",
  muted: "#737373",
  paper: "#fafafa",
  paperWarm: "#f0ede6",
  paperDeep: "#e9e5dc",
  stone: "#cfc9ba",
  line: "#e4e0d6",
  pine: "#1b4332",
  pineDeep: "#0b1d15",
  pineMid: "#2d6a4f",
  sage: "#66a183",
  mist: "#8fae9c",
  ember: "#f26522",
  emberText: "#c2410c",
} as const;

export const CHART_COLORS = {
  income: "#bdb6a4",
  rmd: "#f26522",
  conversion: "#2d6a4f",
  taxable: "#66a183",
  remaining: "rgba(20, 20, 20, 0.025)",
  remainingStroke: "#e4e0d6",
  sliderTrack: "#e9e5dc",
} as const;

export const BRACKET_COLORS: Record<string, string> = {
  "0.10": "#4f8f6f",
  "0.12": "#7fae8f",
  "0.22": "#c9a443",
  "0.24": "#e58a3c",
  "0.32": "#f26522",
  "0.35": "#cf4a17",
  "0.37": "#a3360f",
};
