// Chart colors live in the shared UI package (also used by MCP App Views).
export { BRACKET_COLORS, CHART_COLORS, PALETTE } from "@lucerna/ui";

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
    `Only the taxable part of Social Security is taxed. This is educational scenario analysis, not financial advice.`
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

// Backend (FastAPI) origin. Set NEXT_PUBLIC_API_URL per environment (Vercel); local default.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Canonical origin for SEO metadata, robots.txt and the sitemap. The bare domain redirects here.
export const SITE_URL = "https://www.rothconversionsoptimizer.com";

// Contact for users, reviewers and security reports (privacy, terms, support pages).
export const SUPPORT_EMAIL = "support@rothconversionsoptimizer.com";

// Public MCP server URL people add to Claude or ChatGPT (see /connect).
export const MCP_SERVER_URL = "https://mcp.rothconversionsoptimizer.com/mcp";
