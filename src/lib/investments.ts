import type { Expense, InvestmentAccount, InvestmentHolding, InvestmentIncome, InvestmentValuation } from "../types";
import { localDateString } from "./dates";

export function latestValuationsByAccount(valuations: InvestmentValuation[]) {
  const latest = new Map<string, InvestmentValuation>();
  for (const valuation of valuations) {
    const current = latest.get(valuation.accountId);
    if (
      !current
      || valuation.valuationDate > current.valuationDate
      || (valuation.valuationDate === current.valuationDate && valuation.createdAt > current.createdAt)
    ) {
      latest.set(valuation.accountId, valuation);
    }
  }
  return latest;
}

export function investmentTotals(
  expenses: Expense[],
  accounts: InvestmentAccount[],
  valuations: InvestmentValuation[],
  month?: string,
  income: InvestmentIncome[] = [],
  holdings: InvestmentHolding[] = [],
) {
  const latest = latestValuationsByAccount(valuations);
  const accountIds = new Set(accounts.map((account) => account.id));
  const holdingsById = new Map(holdings.map((holding) => [holding.id, holding]));
  const contributionsByAccount = new Map<string, number>();
  const contributionsByHolding = new Map<string, number>();
  for (const expense of expenses) {
    const accountId = expense.investmentAccountId;
    if (!accountId || !accountIds.has(accountId)) continue;
    contributionsByAccount.set(accountId, (contributionsByAccount.get(accountId) ?? 0) + expense.amountMinor);
    const holding = expense.investmentHoldingId ? holdingsById.get(expense.investmentHoldingId) : undefined;
    if (holding?.accountId === accountId) {
      contributionsByHolding.set(holding.id, (contributionsByHolding.get(holding.id) ?? 0) + expense.amountMinor);
    }
  }
  const contributionsInPeriod = expenses
    .filter((expense) => expense.investmentAccountId
      && accountIds.has(expense.investmentAccountId)
      && (!month || expense.expenseDate.startsWith(`${month}-`)))
    .reduce((total, expense) => total + expense.amountMinor, 0);
  const reinvestedIncomeByAccount = new Map<string, number>();
  for (const payment of income) {
    if (!payment.reinvested || payment.currency !== "MXN" || !accountIds.has(payment.accountId)) continue;
    reinvestedIncomeByAccount.set(
      payment.accountId,
      (reinvestedIncomeByAccount.get(payment.accountId) ?? 0) + payment.amountMinor,
    );
  }
  const holdingsByAccount = new Map<string, InvestmentHolding[]>();
  for (const holding of holdings) {
    const group = holdingsByAccount.get(holding.accountId) ?? [];
    group.push(holding);
    holdingsByAccount.set(holding.accountId, group);
  }
  const currentValueByCurrency = new Map<string, number>();
  const addValue = (currency: string, amount: number) => {
    currentValueByCurrency.set(currency, (currentValueByCurrency.get(currency) ?? 0) + amount);
  };
  const currentValueByAccount = new Map(accounts.map((account) => {
    const valuation = latest.get(account.id);
    const accountHoldings = holdingsByAccount.get(account.id) ?? [];
    let accountValueMinor = 0;
    if (accountHoldings.length === 0) {
      accountValueMinor = valuation
        ? valuation.valueMinor
          + (contributionsByAccount.get(account.id) ?? 0)
          + income
            .filter((payment) => payment.accountId === account.id
              && payment.reinvested
              && payment.currency === "MXN"
              && payment.receivedDate > valuation.valuationDate)
            .reduce((total, payment) => total + payment.amountMinor, 0)
        : (contributionsByAccount.get(account.id) ?? 0) + (reinvestedIncomeByAccount.get(account.id) ?? 0);
      addValue("MXN", accountValueMinor);
      return [account.id, accountValueMinor];
    }

    if (valuation && accountHoldings.some((holding) => holding.currentValueMinor === undefined)) {
      accountValueMinor = valuation.valueMinor
        + (contributionsByAccount.get(account.id) ?? 0)
        + income
          .filter((payment) => payment.accountId === account.id
            && payment.reinvested
            && payment.currency === "MXN"
            && payment.receivedDate > valuation.valuationDate)
          .reduce((total, payment) => total + payment.amountMinor, 0);
      addValue("MXN", accountValueMinor);
      return [account.id, accountValueMinor];
    }

    for (const holding of accountHoldings) {
      const currentValue = holding.currentValueMinor;
      const hasCurrentValue = currentValue !== undefined;
      if (hasCurrentValue) {
        addValue(holding.currency, currentValue);
        if (holding.currency === "MXN") accountValueMinor += currentValue;
      } else if (holding.amountInvestedMinor !== undefined) {
        addValue(holding.currency, holding.amountInvestedMinor);
        if (holding.currency === "MXN") accountValueMinor += holding.amountInvestedMinor;
      }

      for (const expense of expenses) {
        if (expense.investmentHoldingId !== holding.id) continue;
        addValue("MXN", expense.amountMinor);
        accountValueMinor += expense.amountMinor;
      }

      for (const payment of income) {
        if (payment.holdingId !== holding.id || !payment.reinvested) continue;
        if (!hasCurrentValue || !holding.currentValueDate || payment.receivedDate > holding.currentValueDate) {
          addValue(payment.currency, payment.amountMinor);
          if (payment.currency === "MXN") accountValueMinor += payment.amountMinor;
        }
      }
    }

    const unassignedExpenses = expenses.filter((expense) => expense.investmentAccountId === account.id
      && !expense.investmentHoldingId);
    const unassignedContributionMinor = unassignedExpenses.reduce((total, expense) => total + expense.amountMinor, 0);
    const unassignedReinvestedMinor = income
      .filter((payment) => payment.accountId === account.id
        && !holdingsById.has(payment.holdingId)
        && payment.reinvested
        && payment.currency === "MXN"
        && (!valuation || payment.receivedDate > valuation.valuationDate))
      .reduce((total, payment) => total + payment.amountMinor, 0);
    addValue("MXN", unassignedContributionMinor + unassignedReinvestedMinor);
    return [account.id, accountValueMinor + unassignedContributionMinor + unassignedReinvestedMinor];
  }));
  const currentValueMinor = currentValueByCurrency.get("MXN") ?? 0;
  const contributedMinor = month
    ? contributionsInPeriod
    : [...contributionsByAccount.values()].reduce((total, amount) => total + amount, 0);
  return {
    currentValueMinor,
    currentValueByCurrency,
    contributedMinor,
    latest,
    contributionsByAccount,
    contributionsByHolding,
    currentValueByAccount,
  };
}

export function investmentReminders(holdings: InvestmentHolding[], today = localDateString()) {
  return holdings
    .filter((holding) => holding.nextPaymentDate !== null && holding.incomeFrequency !== "none")
    .map((holding) => ({
      holding,
      status: holding.nextPaymentDate! < today ? "overdue" as const
        : holding.nextPaymentDate === today ? "due today" as const
          : holding.nextPaymentDate! <= dateAfterDays(today, 30) ? "coming soon" as const
            : "scheduled" as const,
    }))
    .sort((a, b) => a.holding.nextPaymentDate!.localeCompare(b.holding.nextPaymentDate!));
}

export function incomeTotalsByCurrency(income: InvestmentIncome[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const payment of income) {
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amountMinor);
  }
  return totals;
}

function dateAfterDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(year, month - 1, day + days);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, "0")}-${String(result.getDate()).padStart(2, "0")}`;
}
