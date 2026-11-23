import type { BracketFillData } from "@lucerna/ui";
import { formatCurrency } from "@/lib/utils/formatting";

/**
 * One sentence on what pays the tax on the conversions shown. The plan pays it from
 * income while the household is working, and from the accounts once they fund its
 * spending. Null when nothing is converted, or for a result saved before the engine
 * recorded which years those are.
 */
export function taxSourceNote(years: BracketFillData["years"]): string | null {
  const converting = years.filter((y) => y.conversion > 0);
  if (converting.length === 0 || converting.some((y) => !y.tax_from)) return null;

  const fromIncome = converting
    .filter((y) => y.tax_from === "income")
    .reduce((sum, y) => sum + y.tax, 0);
  const fromAccounts = converting
    .filter((y) => y.tax_from === "accounts")
    .reduce((sum, y) => sum + y.tax, 0);

  if (fromIncome > 0 && fromAccounts > 0) {
    return `${formatCurrency(fromIncome)} of the tax comes out of your income before you start drawing on your accounts. Your account withdrawals pay the rest, on top of your spending.`;
  }
  if (fromIncome > 0) {
    return "The tax comes out of your income in the years you convert, so everything you convert stays invested.";
  }
  if (fromAccounts > 0) {
    return "Your account withdrawals pay the tax, on top of your spending.";
  }
  return null;
}
