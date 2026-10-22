import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyInput, parseAmountToMinor } from "./money";

describe("MXN centavo utilities", () => {
  it("converts pesos to integer centavos without floating point rounding", () => {
    expect(parseAmountToMinor("1248.50")).toBe(124850);
    expect(parseAmountToMinor("0.10")).toBe(10);
    expect(parseAmountToMinor("4")).toBe(400);
  });

  it("rejects zero, oversized and malformed amounts", () => {
    expect(() => parseAmountToMinor("0")).toThrow();
    expect(() => parseAmountToMinor("1000000.01")).toThrow();
    expect(() => parseAmountToMinor("12.345")).toThrow();
    expect(() => parseAmountToMinor("-1")).toThrow();
  });

  it("formats amounts and input values", () => {
    expect(formatMoneyInput(124850)).toBe("1248.50");
    expect(formatMoney(124850)).toContain("1,248.50");
  });
});
