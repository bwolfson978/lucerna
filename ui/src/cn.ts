/** Join class names, skipping falsy ones. Kept dependency-free so the package has
 * nothing to install: consumers resolve only `react`, from their own node_modules. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
