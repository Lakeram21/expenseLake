import { describe, expect, it } from "vitest";
import { hasValidImageSignature } from "./imageValidation.js";

describe("receipt image content validation", () => {
  it("accepts supported MIME types only when the bytes match their image signature", () => {
    expect(hasValidImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0]), "image/jpeg")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]), "image/webp")).toBe(true);
    expect(hasValidImageSignature(Uint8Array.from([0, 1, 2, 3]), "image/jpeg")).toBe(false);
    expect(hasValidImageSignature(new Uint8Array(12), "image/gif")).toBe(false);
  });
});
