/** "Paper & Pine" palette. Keep in sync with tailwind.config.ts and docs/design-aesthetic.md. */
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

export const CURRENT_YEAR = new Date().getFullYear();

/**
 * Generates the assumptions disclaimer shown at the bottom of results.
 * Single source of truth for scope/assumptions language across the product.
 */
export function buildResultsDisclaimer({
  hasStateTax = false,
  acaSentence = "",
}: {
  hasStateTax?: boolean;
  acaSentence?: string;
} = {}): string {
  const brackets = hasStateTax ? "federal and state" : "federal";
  const aca = acaSentence ? ` ${acaSentence}` : "";
  return (
    `This analysis uses 2026 ${brackets} tax brackets, models required minimum distributions (RMDs), ` +
    `and factors in IRMAA surcharges during the Medicare phase.${aca} ` +
    `Social Security income is not modeled. This is educational scenario analysis, not financial advice.`
  );
}

/** Legal disclaimer shown in the footer of every page. */
export const PAGE_FOOTER_DISCLAIMER =
  "This is an educational tool for scenario analysis. It does not provide financial, " +
  "tax, or investment advice. Tax laws change. Consult a qualified professional " +
  "before making financial decisions.";

/** Font family for numeric/data values throughout the app. */
export const DATA_FONT_FAMILY = "'Inter', system-ui";

/** Inline style object for data font — avoids repeating the string in JSX. */
export const dataFontStyle = {
  fontFamily: DATA_FONT_FAMILY,
  fontVariantNumeric: "tabular-nums",
} as const;
