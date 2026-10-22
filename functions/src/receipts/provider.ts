import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import type { RawReceipt } from "./normalize.js";

const providerMode = defineString("RECEIPT_PROVIDER", { default: "openai" });
const providerModel = defineString("RECEIPT_MODEL", { default: "gpt-4o-mini" });
const providerApiKey = defineSecret("RECEIPT_PROVIDER_API_KEY");

export const receiptSecrets = [providerApiKey];

export interface ReceiptVisionProvider {
  extract(imageBytes: Buffer, mimeType: string): Promise<RawReceipt>;
}

class MockReceiptProvider implements ReceiptVisionProvider {
  async extract(): Promise<RawReceipt> {
    return {
      merchant: "Mock receipt — edit before saving",
      date: new Date().toISOString().slice(0, 10),
      total: "125.50",
      currency: "MXN",
      categoryId: "groceries",
      warnings: ["Mock extraction is active. Replace this sample with receipt details."],
    };
  }
}

class OpenAiVisionProvider implements ReceiptVisionProvider {
  async extract(imageBytes: Buffer, mimeType: string): Promise<RawReceipt> {
    const apiKey = providerApiKey.value();
    if (!apiKey) throw new Error("Receipt extraction is not configured. Set RECEIPT_PROVIDER_API_KEY or select the mock provider.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: providerModel.value(),
          temperature: 0,
          max_tokens: 350,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Read a Mexican household receipt. Return only JSON with merchant (string|null), date (YYYY-MM-DD|null), total (number|null, MXN pesos), currency (ISO 4217 code|null), categoryId (one of groceries,dining,transport,home,utilities,health,shopping,entertainment,other), ambiguousTotal (boolean), warnings (string[]). Select the final payable amount, not the subtotal or tax. Explicitly distinguish subtotal, tax, grand total, cash tendered, change, card payment amount, and discounts. Prefer the final amount due after discounts. If multiple totals conflict or the payable total is unclear, set ambiguousTotal=true and total=null. Never infer a missing amount or date.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the receipt fields. Return one JSON object only." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBytes.toString("base64")}`, detail: "high" } },
              ],
            },
          ],
        }),
      });
      if (!response.ok) {
        logger.warn("Receipt provider returned an unsuccessful response", { status: response.status });
        throw new Error("The receipt-reading service is temporarily unavailable.");
      }
      const result = await response.json() as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error("The receipt-reading service returned no readable result.");
      return JSON.parse(content) as RawReceipt;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Receipt reading took too long. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createReceiptProvider(): ReceiptVisionProvider {
  return providerMode.value().toLowerCase() === "mock" ? new MockReceiptProvider() : new OpenAiVisionProvider();
}
