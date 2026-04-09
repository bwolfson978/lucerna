/**
 * Shared style constants extracted from repeated inline values.
 */

/** Font family for numeric/data values throughout the app. */
export const DATA_FONT_FAMILY = "'Manrope', system-ui";

/** Inline style object for data font — avoids repeating the string in JSX. */
export const dataFontStyle = { fontFamily: DATA_FONT_FAMILY } as const;
