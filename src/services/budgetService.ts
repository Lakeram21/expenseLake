import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Budget } from "../types";

function database() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export function budgetId(month: string, categoryId: string): string {
  return `${month}_${categoryId}`;
}

export async function listBudgets(householdId: string, month: string): Promise<Budget[]> {
  const snapshot = await getDocs(collection(database(), "households", householdId, "budgets"));
  return snapshot.docs
    .map((item) => ({ ...item.data(), id: item.id } as Budget))
    .filter((budget) => budget.month === month);
}

export async function saveBudget(
  householdId: string,
  month: string,
  categoryId: string,
  limitMinor: number,
): Promise<void> {
  const id = budgetId(month, categoryId);
  await setDoc(doc(database(), "households", householdId, "budgets", id), {
    month,
    categoryId,
    limitMinor,
    currency: "MXN",
    updatedAt: serverTimestamp(),
  });
}

export function calculateBudget(
  limitMinor: number,
  spentMinor: number,
): { remainingMinor: number; percentUsed: number; status: "safe" | "warning" | "over" } {
  const percentUsed = limitMinor > 0 ? (spentMinor / limitMinor) * 100 : 0;
  return {
    remainingMinor: limitMinor - spentMinor,
    percentUsed,
    status: percentUsed > 100 ? "over" : percentUsed >= 80 ? "warning" : "safe",
  };
}
