import { describe, expect, it } from "vitest";
import { parseReceiptText, parseReceiptTexts } from "./receiptOcr";

describe("receipt OCR text parsing", () => {
  it("prefers a labeled total and extracts a Mexican date", () => {
    const result = parseReceiptText("MERCADO LA LUNA\nFecha: 22/10/2026\nSUBTOTAL $100.00\nTOTAL $116.00");

    expect(result.amountMinor).toBe(11600);
    expect(result.expenseDate).toBe("2026-10-22");
    expect(result.merchant).toBe("MERCADO LA LUNA");
    expect(result.categoryId).toBe("groceries");
    expect(result.warnings).toEqual([]);
    expect(result.needsReview).toBe(true);
  });

  it("flags totals and dates that need manual entry", () => {
    const result = parseReceiptText("TIENDA DE BARRIO\nGracias por su compra");

    expect(result.amountMinor).toBeNull();
    expect(result.expenseDate).toBeNull();
    expect(result.warnings).toHaveLength(2);
  });

  it("prefers a printed merchant name over logo fragments and address lines", () => {
    const result = parseReceiptText([
      "— Y E",
      "Super Farmacia",
      "FARMACIA GUADALAJARA, S.A. DE C.V.",
      "AVENIDA DE LAS AMERICAS 1254 INT UP6",
      "TOTAL $73.50",
    ].join("\n"));

    expect(result.merchant).toBe("FARMACIA GUADALAJARA");
    expect(result.categoryId).toBe("health");
  });

  it("uses the total supported by most OCR readings and warns about disagreements", () => {
    const result = parseReceiptTexts([
      "FARMACIA GUADALAJARA\nTOTAL $75.50",
      "FARMACIA GUADALAJARA\nTOTAL $73.50",
      "FARMACIA GUADALAJARA\nTOTAL $73.50",
    ]);

    expect(result.amountMinor).toBe(7350);
    expect(result.warnings).toContain("The image produced different total readings. Check the amount against the receipt.");
  });
});
