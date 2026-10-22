export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateReceiptFile(file: File): void {
  if (!RECEIPT_MIME_TYPES.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
    throw new Error("Receipt images must be smaller than 8 MB.");
  }
}
