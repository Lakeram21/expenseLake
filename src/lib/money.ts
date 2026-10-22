const MAX_AMOUNT_MINOR = 100_000_000;

export function parseAmountToMinor(value: string): number {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter an amount with up to two decimal places.");
  }
  const [pesos, cents = ""] = normalized.split(".");
  const amountMinor = Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) {
    throw new Error("Amount must be greater than zero and no more than MXN $1,000,000.");
  }
  return amountMinor;
}

export function formatMoney(amountMinor: number, options: { compact?: boolean } = {}): string {
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Money must be an integer number of centavos.");
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: options.compact ? 0 : 2,
    notation: options.compact ? "compact" : "standard",
  }).format(amountMinor / 100);
}

export function formatMoneyInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
