/** Income that runs across a range of the user's ages, as the scenario records it
 * (backend app/tools/draft.py IncomeSource). */
export type IncomeKind = "social_security" | "pension" | "other";

export interface IncomeSource {
  kind: IncomeKind;
  owner: "you" | "spouse";
  label?: string | null;
  /** Yearly amount in dollars. */
  amount: number;
  /** The user's age in the first year. */
  start_age: number;
  /** The user's age in the last year. Null means through the end of the plan. */
  end_age?: number | null;
}

const KIND_LABELS: Record<IncomeKind, string> = {
  social_security: "Social Security",
  pension: "Pension",
  other: "Other income",
};

/** Display name, e.g. "Social Security (spouse)". */
export function incomeSourceLabel(src: IncomeSource): string {
  const name = src.label || KIND_LABELS[src.kind];
  return src.owner === "spouse" ? `${name} (spouse)` : name;
}

/** When it is paid, e.g. "from 67" or "from 60 to 64". */
export function incomeSourceAges(src: IncomeSource): string {
  return src.end_age == null ? `from ${src.start_age}` : `from ${src.start_age} to ${src.end_age}`;
}
