export const ALLOWED_CATEGORIES = new Set([
  "groceries", "dining", "transport", "home", "utilities",
  "health", "shopping", "entertainment", "other",
]);

export interface RawReceipt {
  merchant?: unknown;
  date?: unknown;
  total?: unknown;
  currency?: unknown;
  categoryId?: unknown;
  ambiguousTotal?: unknown;
  warnings?: unknown;
}

export interface NormalizedReceipt {
  merchant: string | null;
  expenseDate: string | null;
  amountMinor: number | null;
  categoryId: string;
  currency: string | null;
  warnings: string[];
  needsReview: boolean;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const normalized = String(value).trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [pesos, centavos = ""] = normalized.split(".");
  const minor = Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 100_000_000 ? minor : null;
}

export function normalizeReceipt(raw: RawReceipt): NormalizedReceipt {
  const warnings: string[] = Array.isArray(raw.warnings)
    ? raw.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 8)
    : [];
  const merchant = typeof raw.merchant === "string" && raw.merchant.trim()
    ? raw.merchant.trim().slice(0, 120)
    : null;
  const date = typeof raw.date === "string" && isValidDate(raw.date) ? raw.date : null;
  const amountMinor = parseAmount(raw.total);
  const currency = typeof raw.currency === "string" ? raw.currency.toUpperCase() : null;
  let categoryId = typeof raw.categoryId === "string" ? raw.categoryId : "other";
  if (!ALLOWED_CATEGORIES.has(categoryId)) {
    categoryId = "other";
    warnings.push("The suggested category needs review.");
  }
  if (!merchant) warnings.push("Merchant could not be identified.");
  if (!date) warnings.push("Receipt date could not be confidently identified.");
  if (amountMinor === null) warnings.push("Final payable total is missing or outside the supported limit.");
  if (raw.ambiguousTotal === true) warnings.push("Multiple totals were present; verify the final amount due.");
  if (currency !== "MXN") warnings.push("Currency could not be confirmed as MXN.");
  return {
    merchant,
    expenseDate: date,
    amountMinor,
    categoryId,
    currency,
    warnings: [...new Set(warnings)],
    needsReview: true,
  };
}
