import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  deleteDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Expense, PaymentMethod, CategoryId } from "../types";

export interface ExpenseInput {
  amountMinor: number;
  merchant: string | null;
  categoryId: CategoryId;
  investmentAccountId?: string | null;
  investmentHoldingId?: string | null;
  expenseDate: string;
  paymentMethod: PaymentMethod | null;
  source?: "manual" | "receipt";
  receiptPath?: string | null;
  notes?: string;
}

function database() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export async function listExpenses(householdId: string): Promise<Expense[]> {
  const snapshot = await getDocs(
    query(collection(database(), "households", householdId, "expenses"), orderBy("expenseDate", "desc")),
  );
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      ...data,
      id: item.id,
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    } as Expense;
  });
}

export async function createExpense(
  householdId: string,
  input: ExpenseInput,
  user: { uid: string; displayName: string },
): Promise<string> {
  const ref = await addDoc(collection(database(), "households", householdId, "expenses"), {
    amountMinor: input.amountMinor,
    currency: "MXN",
    merchant: input.merchant?.trim() || null,
    categoryId: input.categoryId,
    investmentAccountId: input.investmentAccountId ?? null,
    investmentHoldingId: input.investmentHoldingId ?? null,
    expenseDate: input.expenseDate,
    paymentMethod: input.paymentMethod,
    source: input.source ?? "manual",
    receiptPath: input.receiptPath ?? null,
    notes: input.notes?.trim() ?? "",
    createdBy: user.uid,
    createdByName: user.displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateExpense(
  householdId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<void> {
  await updateDoc(doc(database(), "households", householdId, "expenses", expenseId), {
    amountMinor: input.amountMinor,
    merchant: input.merchant?.trim() || null,
    categoryId: input.categoryId,
    investmentAccountId: input.investmentAccountId ?? null,
    investmentHoldingId: input.investmentHoldingId ?? null,
    expenseDate: input.expenseDate,
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim() ?? "",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteExpense(householdId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(database(), "households", householdId, "expenses", expenseId));
}

export async function listMonthExpenses(householdId: string, month: string): Promise<Expense[]> {
  const snapshot = await getDocs(
    query(
      collection(database(), "households", householdId, "expenses"),
      where("expenseDate", ">=", `${month}-01`),
      where("expenseDate", "<=", `${month}-31`),
      orderBy("expenseDate", "desc"),
    ),
  );
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as Expense));
}
