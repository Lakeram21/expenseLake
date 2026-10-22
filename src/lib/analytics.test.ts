import { describe, expect, it } from "vitest";
import { budgetForCategory, spendingByCategory, totalForMonth } from "./analytics";
import { calculateBudget } from "../services/budgetService";
import type { Budget, Expense } from "../types";

const expense = (id: string, amountMinor: number, categoryId: string, expenseDate: string): Expense => ({
  id,
  amountMinor,
  currency: "MXN",
  merchant: null,
  categoryId: categoryId as Expense["categoryId"],
  expenseDate,
  paymentMethod: null,
  source: "manual",
  receiptPath: null,
  notes: "",
  createdBy: "user-a",
  createdByName: "Alex",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("household spending calculations", () => {
  const expenses = [
    expense("a", 1250, "groceries", "2026-10-03"),
    expense("b", 450, "dining", "2026-10-25"),
    expense("c", 999, "groceries", "2026-09-30"),
  ];

  it("aggregates only the intended local calendar month", () => {
    expect(totalForMonth(expenses, "2026-10")).toBe(1700);
    expect(spendingByCategory(expenses, "2026-10").get("groceries")).toBe(1250);
  });

  it("calculates category budgets, warning thresholds and overspending", () => {
    const budgets: Budget[] = [{ id: "2026-10_groceries", month: "2026-10", categoryId: "groceries", limitMinor: 2000, currency: "MXN", updatedAt: new Date() }];
    expect(budgetForCategory(budgets, "groceries")).toBe(2000);
    expect(calculateBudget(2000, 1700)).toMatchObject({ remainingMinor: 300, status: "warning" });
    expect(calculateBudget(1000, 1200)).toMatchObject({ remainingMinor: -200, status: "over" });
    expect(calculateBudget(0, 100)).toMatchObject({ remainingMinor: -100, percentUsed: 0 });
  });
});
