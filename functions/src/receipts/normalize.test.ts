import { describe, expect, it } from "vitest";
import { normalizeReceipt } from "./normalize.js";

describe("receipt extraction normalization", () => {
  it("normalizes MXN pesos into centavos and flags every result for human review", () => {
    expect(normalizeReceipt({
      merchant: "  Mercado  ",
      date: "2026-10-22",
      total: "1,248.50",
      currency: "mxn",
      categoryId: "groceries",
      ambiguousTotal: false,
    })).toMatchObject({
      merchant: "Mercado",
      expenseDate: "2026-10-22",
      amountMinor: 124850,
      currency: "MXN",
      categoryId: "groceries",
      needsReview: true,
    });
  });

  it("flags ambiguous totals, non-MXN currency and invalid category/date/amount", () => {
    const result = normalizeReceipt({
      merchant: null,
      date: "2026-02-30",
      total: "0",
      currency: "USD",
      categoryId: "untrusted",
      ambiguousTotal: true,
    });
    expect(result.amountMinor).toBeNull();
    expect(result.expenseDate).toBeNull();
    expect(result.categoryId).toBe("other");
    expect(result.needsReview).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("Multiple totals"),
      expect.stringContaining("Currency"),
      expect.stringContaining("Merchant"),
    ]));
  });
});
