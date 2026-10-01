/**
 * Chat messages a card's buttons send on the user's behalf. Native cards send them
 * through the web app; Views send them with `ui/message`, so every host gets the same
 * request and the model handles it the same way.
 */
export const RUN_MESSAGE = "Looks right. Run the numbers.";

export function applyWhatIfMessage(label: string): string {
  return `Use the "${label}" what-if as my scenario.`;
}
