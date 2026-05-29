export const CHART_COLORS = {
  income: "#6C5CE7",
  rmd: "#7EC8C8",
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

export const CURRENT_YEAR = new Date().getFullYear();

/** Font family for numeric/data values throughout the app. */
export const DATA_FONT_FAMILY = "'Manrope', system-ui";

/** Inline style object for data font — avoids repeating the string in JSX. */
export const dataFontStyle = { fontFamily: DATA_FONT_FAMILY } as const;
