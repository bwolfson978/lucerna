/**
 * Proportional snap threshold for the conversion slider.
 *
 * Returns a radius (in dollars) that scales with the slider range so the
 * magnetic snap zone roughly matches the visual width of the slider thumb
 * (~1.5 % of the track). A floor of `step` keeps the zone meaningful on
 * very small ranges.
 */
export function computeSnapThreshold(min: number, max: number, step = 100): number {
  return Math.max(step, (max - min) * 0.015);
}

/**
 * If `value` is within the snap zone of `optimalValue`, return
 * `optimalValue`; otherwise return `value` unchanged.
 */
export function maybeSnap(
  value: number,
  optimalValue: number,
  min: number,
  max: number,
  step = 100
): number {
  const threshold = computeSnapThreshold(min, max, step);
  return Math.abs(value - optimalValue) <= threshold ? optimalValue : value;
}
