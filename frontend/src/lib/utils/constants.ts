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

/** Full legal disclaimer used on the methodology page. */
export const METHODOLOGY_LEGAL_DISCLAIMER =
  "This is an educational tool for scenario analysis. It does not provide financial, " +
  "tax, or investment advice. The analysis is based on the inputs you provide and the " +
  "assumptions described above. Tax laws change. Consult a qualified professional " +
  "before making financial decisions.";

/** Font family for numeric/data values throughout the app. */
export const DATA_FONT_FAMILY = "'Manrope', system-ui";

/** Inline style object for data font — avoids repeating the string in JSX. */
export const dataFontStyle = { fontFamily: DATA_FONT_FAMILY } as const;
