import { describe, expect, it } from "vitest";
import { canStartReceiptProcessing } from "./draftState.js";

describe("receipt draft processing state", () => {
  it("allows a fresh draft and retryable failures within the retry limit", () => {
    expect(canStartReceiptProcessing(undefined, 0)).toBe(true);
    expect(canStartReceiptProcessing("failed", 2)).toBe(true);
  });

  it("blocks concurrent, completed, deleted and exhausted duplicate attempts", () => {
    expect(canStartReceiptProcessing("processing", 1)).toBe(false);
    expect(canStartReceiptProcessing("confirmed", 1)).toBe(false);
    expect(canStartReceiptProcessing("deleted", 1)).toBe(false);
    expect(canStartReceiptProcessing("failed", 3)).toBe(false);
  });
});
