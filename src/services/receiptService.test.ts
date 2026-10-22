import { describe, expect, it } from "vitest";
import { MAX_RECEIPT_BYTES, validateReceiptFile } from "./receiptService";

function imageFile(type: string, size: number): File {
  return new File([new Uint8Array(size)], "receipt.jpg", { type });
}

describe("receipt upload validation", () => {
  it("accepts supported images within the size cap", () => {
    expect(() => validateReceiptFile(imageFile("image/jpeg", 100))).not.toThrow();
    expect(() => validateReceiptFile(imageFile("image/png", MAX_RECEIPT_BYTES))).not.toThrow();
    expect(() => validateReceiptFile(imageFile("image/webp", 100))).not.toThrow();
  });

  it("rejects unsupported types and oversized or empty files", () => {
    expect(() => validateReceiptFile(imageFile("image/gif", 100))).toThrow(/JPEG, PNG, or WebP/);
    expect(() => validateReceiptFile(imageFile("image/jpeg", MAX_RECEIPT_BYTES + 1))).toThrow(/8 MB/);
    expect(() => validateReceiptFile(imageFile("image/jpeg", 0))).toThrow(/8 MB/);
  });
});
