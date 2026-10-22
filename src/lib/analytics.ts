import type { Budget, Expense } from "../types";

export function totalForMonth(expenses: Expense[], month: string): number {
  return expenses.reduce(
    (total, expense) => total + (expense.expenseDate.startsWith(`${month}-`) ? expense.amountMinor : 0),
    0,
  );
}

export function spendingByCategory(expenses: Expense[], month: string) {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.expenseDate.startsWith(`${month}-`)) {
      totals.set(expense.categoryId, (totals.get(expense.categoryId) ?? 0) + expense.amountMinor);
    }
  }
  return totals;
}

export function budgetForCategory(budgets: Budget[], categoryId: string): number {
  return budgets.find((budget) => budget.categoryId === categoryId)?.limitMinor ?? 0;
}
