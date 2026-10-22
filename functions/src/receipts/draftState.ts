export function canStartReceiptProcessing(status: unknown, attempts: unknown): boolean {
  return status !== "confirmed" &&
    status !== "deleted" &&
    status !== "processing" &&
    Number.isSafeInteger(attempts) &&
    (attempts as number) < 3;
}
