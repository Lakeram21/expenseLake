import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import type { CategoryId, PaymentMethod } from "./types.js";
import { normalizeReceipt } from "./receipts/normalize.js";
import { hasValidImageSignature } from "./receipts/imageValidation.js";
import { canStartReceiptProcessing } from "./receipts/draftState.js";
import { createReceiptProvider, receiptSecrets } from "./receipts/provider.js";

initializeApp();
const db = getFirestore();
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const CATEGORY_IDS = new Set(["groceries", "dining", "transport", "home", "utilities", "health", "shopping", "entertainment", "other"]);
const PAYMENT_METHODS = new Set(["cash", "debit_card", "credit_card", "bank_transfer", "other"]);

function requireUid(request: { auth?: { uid: string } | null }): string {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return request.auth.uid;
}

async function requireMember(uid: string, householdId: unknown): Promise<string> {
  if (typeof householdId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(householdId)) {
    throw new HttpsError("invalid-argument", "A valid household is required.");
  }
  const member = await db.doc(`households/${householdId}/members/${uid}`).get();
  if (!member.exists || member.data()?.active !== true) {
    throw new HttpsError("permission-denied", "You are not an active member of this household.");
  }
  return householdId;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function safeExpenseInput(value: unknown): {
  amountMinor: number;
  merchant: string | null;
  categoryId: CategoryId;
  expenseDate: string;
  paymentMethod: PaymentMethod | null;
  notes: string;
} {
  if (!value || typeof value !== "object") throw new HttpsError("invalid-argument", "Expense details are required.");
  const data = value as Record<string, unknown>;
  if (!Number.isSafeInteger(data.amountMinor) || (data.amountMinor as number) <= 0 || (data.amountMinor as number) > 100_000_000) {
    throw new HttpsError("invalid-argument", "Enter a valid positive expense amount.");
  }
  if (typeof data.categoryId !== "string" || !CATEGORY_IDS.has(data.categoryId)) {
    throw new HttpsError("invalid-argument", "Choose a valid expense category.");
  }
  if (!validDate(data.expenseDate)) throw new HttpsError("invalid-argument", "Choose a valid expense date.");
  if (data.merchant !== null && data.merchant !== undefined && (typeof data.merchant !== "string" || data.merchant.length > 120)) {
    throw new HttpsError("invalid-argument", "Merchant name is invalid.");
  }
  if (data.paymentMethod !== null && data.paymentMethod !== undefined && !PAYMENT_METHODS.has(String(data.paymentMethod))) {
    throw new HttpsError("invalid-argument", "Payment method is invalid.");
  }
  if (data.notes !== undefined && (typeof data.notes !== "string" || data.notes.length > 500)) {
    throw new HttpsError("invalid-argument", "Notes are too long.");
  }
  return {
    amountMinor: data.amountMinor as number,
    merchant: typeof data.merchant === "string" ? data.merchant.trim() || null : null,
    categoryId: data.categoryId as CategoryId,
    expenseDate: data.expenseDate,
    paymentMethod: typeof data.paymentMethod === "string" ? data.paymentMethod as PaymentMethod : null,
    notes: typeof data.notes === "string" ? data.notes.trim() : "",
  };
}

export const processReceipt = onCall({ secrets: receiptSecrets, timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
  const uid = requireUid(request);
  const householdId = await requireMember(uid, request.data?.householdId);
  const { draftId, storagePath } = request.data ?? {};
  if (typeof draftId !== "string" || !/^[0-9a-f-]{36}$/i.test(draftId)) {
    throw new HttpsError("invalid-argument", "A valid receipt draft is required.");
  }
  const expectedPath = `households/${householdId}/receipts/${draftId}/${draftId}`;
  if (storagePath !== expectedPath) throw new HttpsError("permission-denied", "Receipt path does not match this household and draft.");
  const draftRef = db.doc(`households/${householdId}/receiptDrafts/${draftId}`);
  const usageRef = db.doc(`households/${householdId}/receiptUsage/${new Date().toISOString().slice(0, 10)}`);
  const lock = await db.runTransaction(async (transaction) => {
    const draft = await transaction.get(draftRef);
    const usage = await transaction.get(usageRef);
    const data = draft.data();
    if (draft.exists && data?.status === "confirmed") {
      throw new HttpsError("already-exists", "This receipt has already been saved.");
    }
    if (draft.exists && data?.status === "deleted") {
      throw new HttpsError("failed-precondition", "This receipt was already deleted.");
    }
    if (draft.exists && data?.uid !== uid) throw new HttpsError("permission-denied", "This receipt draft belongs to another user.");
    if (draft.exists && data?.status === "processing") throw new HttpsError("resource-exhausted", "This receipt is already being processed.");
    if (draft.exists && (data?.attempts ?? 0) >= 3) throw new HttpsError("resource-exhausted", "The retry limit was reached. Enter the expense manually.");
    if (draft.exists && !canStartReceiptProcessing(data?.status, data?.attempts ?? 0)) {
      throw new HttpsError("failed-precondition", "This receipt is no longer available for processing.");
    }
    if (draft.exists && data?.storagePath !== expectedPath) throw new HttpsError("permission-denied", "Receipt path is invalid.");
    const dailyCount = usage.data()?.count ?? 0;
    if (dailyCount >= 50) throw new HttpsError("resource-exhausted", "This household has reached its daily receipt-processing limit.");
    transaction.set(draftRef, {
      uid,
      storagePath: expectedPath,
      status: "processing",
      attempts: (data?.attempts ?? 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
      ...(draft.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    transaction.set(usageRef, {
      count: dailyCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
  if (!lock) throw new HttpsError("internal", "Couldn't start receipt processing.");

  try {
    const file = getStorage().bucket().file(expectedPath);
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType ?? "";
    const size = Number(metadata.size ?? 0);
    if (!IMAGE_TYPES.has(contentType) || size <= 0 || size > MAX_RECEIPT_BYTES) {
      throw new HttpsError("invalid-argument", "Receipt image type or size is not supported.");
    }
    if (metadata.metadata?.uploadedBy !== uid) {
      throw new HttpsError("permission-denied", "This receipt image was not uploaded by the signed-in user.");
    }
    const [bytes] = await file.download();
    if (!hasValidImageSignature(bytes, contentType)) {
      throw new HttpsError("invalid-argument", "The uploaded file does not match a supported image format.");
    }
    const extracted = await createReceiptProvider().extract(bytes, contentType);
    const result = normalizeReceipt(extracted);
    await draftRef.update({
      status: "needs_review",
      extraction: result,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return result;
  } catch (error) {
    await draftRef.set({
      status: "failed",
      error: error instanceof HttpsError ? error.message : "Receipt processing failed. Please retry or enter the expense manually.",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (error instanceof HttpsError) throw error;
    logger.warn("Receipt extraction failed", { householdId, draftId });
    throw new HttpsError("unavailable", error instanceof Error ? error.message : "Receipt extraction failed.");
  }
});

export const confirmReceipt = onCall(async (request) => {
  const uid = requireUid(request);
  const householdId = await requireMember(uid, request.data?.householdId);
  const { draftId } = request.data ?? {};
  if (typeof draftId !== "string" || !/^[0-9a-f-]{36}$/i.test(draftId)) {
    throw new HttpsError("invalid-argument", "A valid receipt draft is required.");
  }
  const expense = safeExpenseInput(request.data?.expense);
  const draftRef = db.doc(`households/${householdId}/receiptDrafts/${draftId}`);
  const expenseRef = db.doc(`households/${householdId}/expenses/receipt_${draftId}`);
  const confirmation = await db.runTransaction(async (transaction) => {
    const draft = await transaction.get(draftRef);
    const data = draft.data();
    if (!draft.exists || data?.uid !== uid) {
      throw new HttpsError("failed-precondition", "This receipt is not ready to confirm.");
    }
    const expectedPath = `households/${householdId}/receipts/${draftId}/${draftId}`;
    if (data.storagePath !== undefined && data.storagePath !== expectedPath) {
      throw new HttpsError("permission-denied", "Receipt path is invalid.");
    }
    const existingExpense = await transaction.get(expenseRef);
    if (existingExpense.exists) {
      if (existingExpense.data()?.receiptDraftId === draftId) {
        return { expenseId: expenseRef.id, storagePath: data.storagePath === expectedPath ? expectedPath : null };
      }
      throw new HttpsError("already-exists", "This receipt already has an expense.");
    }
    if (data?.status !== "needs_review") {
      throw new HttpsError("failed-precondition", "This receipt is not ready to confirm.");
    }
    if (data.storagePath !== expectedPath) {
      throw new HttpsError("failed-precondition", "The temporary receipt image is no longer available.");
    }
    transaction.create(expenseRef, {
      ...expense,
      currency: "MXN",
      source: "receipt",
      receiptPath: null,
      receiptDraftId: draftId,
      createdBy: uid,
      createdByName: request.auth?.token.name ?? request.auth?.token.email ?? "Household member",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(draftRef, {
      status: "confirmed",
      expenseId: expenseRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { expenseId: expenseRef.id, storagePath: expectedPath };
  });
  if (confirmation.storagePath) {
    try {
      await getStorage().bucket().file(confirmation.storagePath).delete({ ignoreNotFound: true });
      await draftRef.update({
        storagePath: FieldValue.delete(),
        extraction: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch {
      logger.error("Temporary receipt cleanup failed after confirmation", { householdId, draftId });
      throw new HttpsError(
        "unavailable",
        "The expense was saved, but the temporary receipt image could not be removed. Please retry to finish cleanup.",
      );
    }
  }
  return { expenseId: confirmation.expenseId };
});

export const deleteExpense = onCall(async (request) => {
  const uid = requireUid(request);
  const householdId = await requireMember(uid, request.data?.householdId);
  const expenseId = request.data?.expenseId;
  if (typeof expenseId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(expenseId)) {
    throw new HttpsError("invalid-argument", "A valid expense is required.");
  }
  const expenseRef = db.doc(`households/${householdId}/expenses/${expenseId}`);
  const cleanup = await db.runTransaction(async (transaction) => {
    const expense = await transaction.get(expenseRef);
    if (!expense.exists) {
      const draftId = expenseId.startsWith("receipt_") ? expenseId.slice("receipt_".length) : "";
      if (!/^[0-9a-f-]{36}$/i.test(draftId)) return null;
      const draftRef = db.doc(`households/${householdId}/receiptDrafts/${draftId}`);
      const draft = await transaction.get(draftRef);
      const data = draft.data();
      if (!draft.exists || data?.uid !== uid || data?.status !== "deleted") return null;
      const storagePath = typeof data.storagePath === "string" ? data.storagePath : null;
      return { draftId, storagePath };
    }
    const data = expense.data()!;
    if (data.createdBy !== uid) throw new HttpsError("permission-denied", "You can only delete expenses you recorded.");
    let receiptDraftRef: ReturnType<typeof db.doc> | null = null;
    let receiptDraftId: string | null = null;
    if (data.source === "receipt") {
      const draftId = data.receiptDraftId;
      const path = data.receiptPath;
      if (
        typeof draftId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(draftId) ||
        (path !== null && path !== undefined && path !== `households/${householdId}/receipts/${draftId}/${draftId}`)
      ) {
        throw new HttpsError("failed-precondition", "The receipt record is invalid; contact support.");
      }
      receiptDraftId = draftId;
      receiptDraftRef = db.doc(`households/${householdId}/receiptDrafts/${draftId}`);
      await transaction.get(receiptDraftRef);
    }
    transaction.delete(expenseRef);
    if (receiptDraftRef) {
      transaction.update(receiptDraftRef, {
        status: "deleted",
        extraction: FieldValue.delete(),
        expenseId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return receiptDraftId
      ? { draftId: receiptDraftId, storagePath: typeof data.receiptPath === "string" ? data.receiptPath : null }
      : null;
  });
  if (cleanup) {
    if (cleanup.storagePath) {
      try {
        await getStorage().bucket().file(cleanup.storagePath).delete({ ignoreNotFound: true });
      } catch {
        logger.error("Receipt image cleanup failed after expense deletion", { householdId, expenseId });
        throw new HttpsError("unavailable", "The expense was deleted, but its receipt image could not be removed. Please contact support.");
      }
    }
    await db.doc(`households/${householdId}/receiptDrafts/${cleanup.draftId}`).delete();
  }
  return { ok: true };
});

export const createHouseholdInvitation = onCall(async (request) => {
  const uid = requireUid(request);
  const householdId = await requireMember(uid, request.data?.householdId);
  const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  const householdRef = db.doc(`households/${householdId}`);
  const memberRef = db.doc(`households/${householdId}/members/${uid}`);
  const [household, caller, members] = await Promise.all([householdRef.get(), memberRef.get(), householdRef.collection("members").get()]);
  if (!household.exists || caller.data()?.role !== "owner") throw new HttpsError("permission-denied", "Only the household owner can invite members.");
  if (members.size >= 2) throw new HttpsError("failed-precondition", "This household already has two members.");
  if (members.docs.some((member) => member.id === uid)) {
    const existing = await getAuth().getUser(uid);
    if (existing.email?.toLowerCase() === email) throw new HttpsError("invalid-argument", "Invite someone else in your household.");
  }
  const code = randomBytes(24).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const invitationRef = db.doc(`householdInvitations/${codeHash}`);
  await invitationRef.create({
    householdId,
    email,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: "pending",
  });
  return { code, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() };
});

export const acceptHouseholdInvitation = onCall(async (request) => {
  const uid = requireUid(request);
  const email = typeof request.auth?.token.email === "string" ? request.auth.token.email.toLowerCase() : "";
  const code = typeof request.data?.code === "string" ? request.data.code : "";
  if (!email || code.length < 30 || code.length > 100) throw new HttpsError("invalid-argument", "This invitation is invalid.");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const inviteRef = db.doc(`householdInvitations/${codeHash}`);
  await db.runTransaction(async (transaction) => {
    const invite = await transaction.get(inviteRef);
    const data = invite.data();
    if (!invite.exists || data?.status !== "pending" || !(data.expiresAt instanceof Timestamp) || data.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError("deadline-exceeded", "This invitation has expired or was already used.");
    }
    if (data.email !== email) throw new HttpsError("permission-denied", "This invitation was sent to another email address.");
    const householdRef = db.doc(`households/${data.householdId}`);
    const memberRef = db.doc(`households/${data.householdId}/members/${uid}`);
    const userRef = db.doc(`users/${uid}`);
    const members = await transaction.get(householdRef.collection("members"));
    if (members.size >= 2) throw new HttpsError("failed-precondition", "This household already has two members.");
    transaction.create(memberRef, { role: "member", active: true, joinedAt: FieldValue.serverTimestamp() });
    transaction.set(userRef, {
      email,
      displayName: request.auth?.token.name ?? email.split("@")[0],
      defaultHouseholdId: data.householdId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.update(inviteRef, { status: "accepted", acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});
