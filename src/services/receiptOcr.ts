import { createWorker } from "tesseract.js";
import { doc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CategoryId, ReceiptExtraction } from "../types";
import { validateReceiptFile } from "./receiptService";

const RECEIPT_LOCK_MINUTES = 14;

const CATEGORY_HINTS: Record<CategoryId, string[]> = {
  groceries: ["super", "mercado", "abarrotes", "walmart", "soriana", "costco"],
  dining: ["restaurante", "restaurant", "cafe", "cafeteria", "taqueria", "comida"],
  transport: ["gasolin", "uber", "didi", "transporte", "estacionamiento"],
  home: ["ferreteria", "muebles", "hogar", "home depot"],
  utilities: ["electricidad", "cfe", "agua", "internet", "telefono"],
  health: ["farmacia", "hospital", "clinica", "salud"],
  shopping: ["tienda", "ropa", "zapateria"],
  entertainment: ["cine", "teatro", "streaming"],
  other: [],
};

const MERCHANT_HINTS = Object.values(CATEGORY_HINTS).flat();
const TOTAL_LABEL = /\b(total|a pagar|importe|monto a pagar|gran total)\b/i;
const NON_TOTAL_LABEL = /\b(subtotal|impuesto|iva|ahorro|cambio|vuelto)\b/i;

function amountFromText(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(/\$/g, "");
  const amount = normalized.includes(".")
    ? normalized.replace(/,/g, "")
    : normalized.replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [pesos, cents = ""] = amount.split(".");
  const minor = Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 100_000_000 ? minor : null;
}

function parseDate(text: string): string | null {
  const match = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const shortYear = Number(match[3]);
  const year = shortYear < 100 ? 2000 + shortYear : shortYear;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function parseReceiptText(text: string): ReceiptExtraction {
  return parseReceiptTexts([text]);
}

export function parseReceiptTexts(readings: string[]): ReceiptExtraction {
  const readingLines = readings.map((reading) => reading.split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean));
  const totalVotes = new Map<number, number>();
  const allAmounts = new Map<number, number>();

  for (const lines of readingLines) {
    const amountCandidates = lines.flatMap((line) => {
    const matches = line.match(/(?:\d{1,3}(?:,\d{3})+|\d+)[.,]\d{2}/g) ?? [];
    return matches.map((match) => ({
      amountMinor: amountFromText(match),
      isTotal: TOTAL_LABEL.test(line) && !NON_TOTAL_LABEL.test(line),
    }));
    }).filter((candidate): candidate is { amountMinor: number; isTotal: boolean } => candidate.amountMinor !== null);
    for (const candidate of amountCandidates) {
      allAmounts.set(candidate.amountMinor, (allAmounts.get(candidate.amountMinor) ?? 0) + 1);
      if (candidate.isTotal) totalVotes.set(candidate.amountMinor, (totalVotes.get(candidate.amountMinor) ?? 0) + 1);
    }
  }

  const totalEntries = [...totalVotes].sort((a, b) => b[1] - a[1]);
  const amountEntries = [...allAmounts].sort((a, b) => b[1] - a[1]);
  const amountMinor = totalEntries[0]?.[0] ?? amountEntries[0]?.[0] ?? null;
  const hasDisagreeingTotals = totalEntries.length > 1;
  const allLines = readingLines.flat();
  const expenseDate = parseDate(allLines.join("\n"));
  const merchantCandidates = allLines.flatMap((line, index) => {
    const hasLegalSuffix = /\bS\.?\s*A\.?(?:\s+DE\s+C\.?\s*V\.?)?/i.test(line);
    const cleaned = line
      .replace(/,?\s+S\.?\s*A\.?(?:\s+DE\s+C\.?\s*V\.?)?.*$/i, "")
      .replace(/^[^A-Za-zÁÉÍÓÚÜÑ]+|[^A-Za-zÁÉÍÓÚÜÑ0-9&.' -]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const letters = cleaned.match(/[A-Za-zÁÉÍÓÚÜÑ]/g)?.length ?? 0;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (
      cleaned.length < 5 || cleaned.length > 100 || letters < 5 || words.length < 2
      || !/\p{L}/u.test(cleaned)
      || /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cleaned)
      || /\b(total|subtotal|gracias|ticket|cajero|caja|fecha|rfc|avenida|av\.|col\.|suc\.|c\.p\.|tarjeta|terminal|afiliacion)\b/i.test(cleaned)
    ) return [];
    const normalized = cleaned.toLocaleLowerCase("es-MX");
    const hintMatches = MERCHANT_HINTS.filter((hint) => normalized.includes(hint)).length;
    const score = hintMatches * 8 + Math.min(words.length, 5) + Math.min(letters / 8, 5)
      + (hasLegalSuffix ? 10 : 0) + (index < 8 ? 4 : Math.max(0, 4 - index / 4));
    return [{ text: cleaned.slice(0, 120), score }];
  });
  const merchant = merchantCandidates.sort((a, b) => b.score - a.score)[0]?.text ?? null;
  const merchantLower = merchant?.toLocaleLowerCase("es-MX") ?? "";
  const categoryId = (Object.entries(CATEGORY_HINTS).find(([, hints]) =>
    hints.some((hint) => merchantLower.includes(hint)),
  )?.[0] ?? "other") as CategoryId;
  const warnings = [
    ...(amountMinor === null ? ["We couldn't detect the total. Enter it manually."] : []),
    ...(amountMinor !== null && totalEntries.length === 0 ? ["We couldn't identify a clearly labeled total. Check the detected amount."] : []),
    ...(hasDisagreeingTotals ? ["The image produced different total readings. Check the amount against the receipt."] : []),
    ...(expenseDate === null ? ["We couldn't detect the date. Choose it manually."] : []),
    ...(merchant === null ? ["We couldn't detect the merchant."] : []),
  ];
  return {
    amountMinor,
    expenseDate,
    merchant,
    categoryId,
    currency: "MXN",
    warnings,
    needsReview: true,
  };
}

async function createOcrCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    bitmap.close();
    throw new Error("This browser couldn't prepare the receipt image for scanning.");
  }
  sourceContext.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const enhanced = document.createElement("canvas");
  enhanced.width = width;
  enhanced.height = height;
  const enhancedContext = enhanced.getContext("2d", { willReadFrequently: true });
  if (!enhancedContext) throw new Error("This browser couldn't enhance the receipt image.");
  const pixels = sourceContext.getImageData(0, 0, width, height);
  const enhancedPixels = enhancedContext.createImageData(width, height);
  const thresholdPixels = new Uint8ClampedArray(pixels.data.length);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray = Math.round(pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114);
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    enhancedPixels.data[index] = contrast;
    enhancedPixels.data[index + 1] = contrast;
    enhancedPixels.data[index + 2] = contrast;
    enhancedPixels.data[index + 3] = pixels.data[index + 3];
    const binary = contrast < 168 ? 0 : 255;
    thresholdPixels[index] = binary;
    thresholdPixels[index + 1] = binary;
    thresholdPixels[index + 2] = binary;
    thresholdPixels[index + 3] = pixels.data[index + 3];
  }
  enhancedContext.putImageData(enhancedPixels, 0, 0);

  const thresholded = document.createElement("canvas");
  thresholded.width = width;
  thresholded.height = height;
  const thresholdContext = thresholded.getContext("2d");
  if (!thresholdContext) throw new Error("This browser couldn't create a high-contrast receipt image.");
  const thresholdImage = thresholdContext.createImageData(width, height);
  thresholdImage.data.set(thresholdPixels);
  thresholdContext.putImageData(thresholdImage, 0, 0);

  const cropTop = Math.round(height * 0.28);
  const cropHeight = Math.max(1, Math.round(height * 0.57));
  const totalRegion = document.createElement("canvas");
  totalRegion.width = width;
  totalRegion.height = Math.round(cropHeight * 1.5);
  const totalContext = totalRegion.getContext("2d");
  if (!totalContext) throw new Error("This browser couldn't isolate the receipt total.");
  totalContext.drawImage(enhanced, 0, cropTop, width, cropHeight, 0, 0, totalRegion.width, totalRegion.height);

  return [source, enhanced, thresholded, totalRegion];
}

async function acquireReceiptLock(uid: string, lockId: string): Promise<void> {
  if (!db) throw new Error("Firebase is not configured.");
  const lockRef = doc(db, "users", uid, "receiptProcessing", "current");
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    const expiresAt = snapshot.data()?.expiresAt;
    if (snapshot.exists() && expiresAt instanceof Timestamp && expiresAt.toMillis() > Date.now()) {
      throw new Error("A receipt is already being processed for this account. Wait for it to finish before scanning another.");
    }
    transaction.set(lockRef, {
      lockId,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + RECEIPT_LOCK_MINUTES * 60 * 1000),
    });
  });
}

async function releaseReceiptLock(uid: string, lockId: string): Promise<void> {
  if (!db) throw new Error("Firebase is not configured.");
  const lockRef = doc(db, "users", uid, "receiptProcessing", "current");
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(lockRef);
    if (snapshot.exists() && snapshot.data().lockId === lockId) transaction.delete(lockRef);
  });
}

export async function extractReceiptFromImage(file: File, uid: string): Promise<ReceiptExtraction> {
  validateReceiptFile(file);
  const lockId = crypto.randomUUID();
  await acquireReceiptLock(uid, lockId);
  try {
    const canvases = await createOcrCanvases(file);
    const worker = await createWorker(["spa", "eng"]);
    try {
      const readings: string[] = [];
      for (const canvas of canvases) {
        const { data } = await worker.recognize(canvas, { rotateAuto: true });
        readings.push(data.text);
      }
      return parseReceiptTexts(readings);
    } finally {
      await worker.terminate();
    }
  } finally {
    await releaseReceiptLock(uid, lockId);
  }
}
