/**
 * Shared SVG icon components.
 * Extracted from inline SVGs that were duplicated across multiple components.
 */

interface IconProps {
  className?: string;
  size?: number;
}

/** Chevron pointing right. Rotate via className for other directions. */
export function ChevronIcon({ className, size = 12 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5l3.5 3.5-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Chevron pointing down. Rotate via className for other directions. */
export function ChevronDownIcon({ className, size = 12 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four-point sparkle, filled. Marks the Claude and ChatGPT entry points. */
export function SparkleIcon({ className, size = 12 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 0c.5 4.2 2.8 6.6 8 8-5.2 1.4-7.5 3.8-8 8-.5-4.2-2.8-6.6-8-8 5.2-1.4 7.5-3.8 8-8z" />
    </svg>
  );
}
